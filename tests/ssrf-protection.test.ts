/**
 * SSRF protection — unit tests.
 *
 * The security-critical `validateRemoteUrl()` function is tested with a
 * deterministic mock DNS lookup so we can verify every block/allow rule
 * without making real network calls.
 */

import { describe, it, expect } from "vitest";
import { validateRemoteUrl, type Lookup, type LookupAddress } from "../extensions/web-fetch/ssrf-protection.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a mock lookup that resolves a hostname to the given IPs. */
function mockLookup(...records: { hostname: string; addresses: LookupAddress[] }[]): Lookup {
	const map = new Map(records.map((r) => [r.hostname, r.addresses]));
	return async (hostname) => {
		const addrs = map.get(hostname);
		if (!addrs) throw new Error(`Mock DNS: ${hostname} not found`);
		return addrs;
	};
}

const ipv4 = (address: string): LookupAddress => ({ address, family: 4 });
const ipv6 = (address: string): LookupAddress => ({ address, family: 6 });

// ---------------------------------------------------------------------------
// Protocol & hostname blocking
// ---------------------------------------------------------------------------

describe("validateRemoteUrl — protocol & hostname", () => {
	it("rejects non-HTTP protocols", async () => {
		await expect(validateRemoteUrl("ftp://example.com", { lookup: mockLookup() })).rejects.toThrow(
			/Only HTTP and HTTPS/,
		);
		await expect(validateRemoteUrl("file:///etc/passwd", { lookup: mockLookup() })).rejects.toThrow(
			/Only HTTP and HTTPS/,
		);
		await expect(validateRemoteUrl("javascript:alert(1)", { lookup: mockLookup() })).rejects.toThrow(
			/Only HTTP and HTTPS/,
		);
	});

	it("rejects bare 'localhost'", async () => {
		await expect(validateRemoteUrl("http://localhost/admin", { lookup: mockLookup() })).rejects.toThrow(
			/Blocked internal hostname/,
		);
	});

	it("rejects subdomain of localhost", async () => {
		await expect(validateRemoteUrl("http://app.localhost/admin", { lookup: mockLookup() })).rejects.toThrow(
			/Blocked internal hostname/,
		);
	});

	it("rejects URLs without a hostname", async () => {
		// URL("http:///path") is technically invalid, but the constructor may still succeed —
		// our code must still reject it.
		await expect(validateRemoteUrl("http://", { lookup: mockLookup() })).rejects.toThrow();
	});

	it("rejects URLs with inline IP addresses that are private", async () => {
		await expect(validateRemoteUrl("http://127.0.0.1/secret", { lookup: mockLookup() })).rejects.toThrow(
			/Blocked internal address/,
		);

		await expect(validateRemoteUrl("http://10.0.0.1/admin", { lookup: mockLookup() })).rejects.toThrow(
			/Blocked internal address/,
		);

		await expect(
			validateRemoteUrl("http://169.254.169.254/latest/meta-data/", { lookup: mockLookup() }),
		).rejects.toThrow(/Blocked internal address/);
	});

	it("accepts public IP addresses directly in the URL", async () => {
		const url = await validateRemoteUrl("https://8.8.8.8/dns-query", { lookup: mockLookup() });
		expect(url.hostname).toBe("8.8.8.8");
	});
});

// ---------------------------------------------------------------------------
// DNS-based SSRF protection (private IPs resolved from public hostnames)
// ---------------------------------------------------------------------------

describe("validateRemoteUrl — DNS rebind protection", () => {
	it("blocks a hostname that resolves to a loopback address", async () => {
		const lookup = mockLookup({
			hostname: "attacker.com",
			addresses: [ipv4("127.0.0.1")],
		});
		await expect(validateRemoteUrl("https://attacker.com/", { lookup })).rejects.toThrow(
			/Blocked internal address/,
		);
	});

	it("blocks a hostname that resolves to the AWS metadata endpoint", async () => {
		const lookup = mockLookup({
			hostname: "metadata.local",
			addresses: [ipv4("169.254.169.254")],
		});
		await expect(validateRemoteUrl("http://metadata.local/latest/meta-data/", { lookup })).rejects.toThrow(
			/Blocked internal address/,
		);
	});

	it("blocks when ANY resolved address is private (mixed)", async () => {
		const lookup = mockLookup({
			hostname: "mixed.example.com",
			addresses: [ipv4("8.8.8.8"), ipv4("10.0.0.1")],
		});
		await expect(validateRemoteUrl("https://mixed.example.com/", { lookup })).rejects.toThrow(
			/Blocked internal address/,
		);
	});

	it("allows a hostname that resolves only to public IPs", async () => {
		const lookup = mockLookup({
			hostname: "safe.example.com",
			addresses: [ipv4("93.184.216.34"), ipv4("151.101.1.67")],
		});
		const url = await validateRemoteUrl("https://safe.example.com/", { lookup });
		expect(url.hostname).toBe("safe.example.com");
	});

	it("propagates DNS errors with a clear message", async () => {
		const lookup = mockLookup(); // no records → lookup throws
		await expect(validateRemoteUrl("https://nonexistent.invalid/", { lookup })).rejects.toThrow(
			/Failed to resolve/,
		);
	});
});

// ---------------------------------------------------------------------------
// Private IPv4 ranges
// ---------------------------------------------------------------------------

describe("validateRemoteUrl — IPv4 private ranges", () => {
	const blocked = [
		["0.0.0.0", "current network"],
		["10.0.0.1", "Class A private"],
		["100.64.0.1", "CGNAT (shared address space)"],
		["127.0.0.1", "loopback"],
		["169.254.1.1", "link-local"],
		["172.16.0.1", "Class B private"],
		["192.168.1.1", "Class C private"],
		["224.0.0.1", "multicast"],
		["240.0.0.1", "reserved"],
	];

	for (const [ip, label] of blocked) {
		it(`blocks ${ip} (${label})`, async () => {
			const lookup = mockLookup({ hostname: "test.example.com", addresses: [ipv4(ip)] });
			await expect(validateRemoteUrl("https://test.example.com/", { lookup })).rejects.toThrow(
				/Blocked internal address/,
			);
		});
	}

	const allowed = [
		["1.1.1.1", "Cloudflare DNS"],
		["8.8.8.8", "Google DNS"],
		["104.16.0.1", "Cloudflare CDN"],
		["151.101.1.67", "Fastly"],
	];

	for (const [ip, label] of allowed) {
		it(`allows ${ip} (${label})`, async () => {
			const lookup = mockLookup({ hostname: "test.example.com", addresses: [ipv4(ip)] });
			const url = await validateRemoteUrl("https://test.example.com/", { lookup });
			expect(url.hostname).toBe("test.example.com");
		});
	}
});

// ---------------------------------------------------------------------------
// allowRanges — CIDR exemptions
// ---------------------------------------------------------------------------

describe("validateRemoteUrl — allowRanges", () => {
	it("exempts addresses within an allowed CIDR range", async () => {
		const lookup = mockLookup({
			hostname: "internal.example.com",
			addresses: [ipv4("198.18.0.5")],
		});
		const url = await validateRemoteUrl("https://internal.example.com/", {
			lookup,
			allowRanges: ["198.18.0.0/15"],
		});
		expect(url.hostname).toBe("internal.example.com");
	});

	it("still blocks addresses outside the allowed range", async () => {
		const lookup = mockLookup({
			hostname: "bad.example.com",
			addresses: [ipv4("10.0.0.1")],
		});
		await expect(
			validateRemoteUrl("https://bad.example.com/", {
				lookup,
				allowRanges: ["198.18.0.0/15"],
			}),
		).rejects.toThrow(/Blocked internal address/);
	});

	it("accepts multiple allowRanges", async () => {
		const lookup = mockLookup({
			hostname: "dual.example.com",
			addresses: [ipv4("198.18.0.1"), ipv4("100.64.0.1")],
		});
		await expect(
			validateRemoteUrl("https://dual.example.com/", {
				lookup,
				allowRanges: ["198.18.0.0/15", "100.64.0.0/10"],
			}),
		).resolves.toBeInstanceOf(URL);
	});

	it("throws on malformed CIDR in allowRanges", async () => {
		const lookup = mockLookup({
			hostname: "test.example.com",
			addresses: [ipv4("8.8.8.8")],
		});
		await expect(
			validateRemoteUrl("https://test.example.com/", {
				lookup,
				allowRanges: ["not-a-cidr"],
			}),
		).rejects.toThrow(/Invalid CIDR/);
	});

	it("throws on non-string entries in allowRanges", async () => {
		const lookup = mockLookup({
			hostname: "test.example.com",
			addresses: [ipv4("8.8.8.8")],
		});
		await expect(
			validateRemoteUrl("https://test.example.com/", {
				lookup,
				allowRanges: [123 as unknown as string],
			}),
		).rejects.toThrow(/must be strings/);
	});
});

// ---------------------------------------------------------------------------
// IPv6 blocking
// ---------------------------------------------------------------------------

describe("validateRemoteUrl — IPv6", () => {
	it("blocks ::1 (IPv6 loopback)", async () => {
		const lookup = mockLookup({
			hostname: "v6.example.com",
			addresses: [ipv6("::1")],
		});
		await expect(validateRemoteUrl("https://v6.example.com/", { lookup })).rejects.toThrow(
			/Blocked internal address/,
		);
	});

	it("blocks ::ffff:127.0.0.1 (IPv4-mapped IPv6 loopback)", async () => {
		const lookup = mockLookup({
			hostname: "v6mapped.example.com",
			addresses: [ipv6("::ffff:7f00:0001")],
		});
		await expect(validateRemoteUrl("https://v6mapped.example.com/", { lookup })).rejects.toThrow(
			/Blocked internal address/,
		);
	});

	it("blocks link-local IPv6 (fe80::)", async () => {
		const lookup = mockLookup({
			hostname: "linklocal.example.com",
			addresses: [ipv6("fe80::1")],
		});
		await expect(validateRemoteUrl("https://linklocal.example.com/", { lookup })).rejects.toThrow(
			/Blocked internal address/,
		);
	});

	it("allows public IPv6 addresses", async () => {
		const lookup = mockLookup({
			hostname: "v6.example.com",
			addresses: [ipv6("2606:4700:4700::1111")],
		});
		const url = await validateRemoteUrl("https://v6.example.com/", { lookup });
		expect(url.hostname).toBe("v6.example.com");
	});
});
