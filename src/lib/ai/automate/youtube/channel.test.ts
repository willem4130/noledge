import { describe, expect, it } from "vitest";
import { parseChannelInput } from "./channel";

describe("parseChannelInput", () => {
	it("parses bare handles and channel ids", () => {
		expect(parseChannelInput("@veritasium")).toEqual({
			kind: "handle",
			value: "veritasium",
		});
		expect(parseChannelInput("veritasium")).toEqual({
			kind: "handle",
			value: "veritasium",
		});
		expect(parseChannelInput("UCHnyfMqiRRG1u-2MsSQLbXA")).toEqual({
			kind: "id",
			value: "UCHnyfMqiRRG1u-2MsSQLbXA",
		});
	});

	it("parses channel URLs of each shape", () => {
		expect(parseChannelInput("https://www.youtube.com/@veritasium")).toEqual({
			kind: "handle",
			value: "veritasium",
		});
		expect(
			parseChannelInput("https://youtube.com/channel/UCHnyfMqiRRG1u-2MsSQLbXA"),
		).toEqual({ kind: "id", value: "UCHnyfMqiRRG1u-2MsSQLbXA" });
		expect(parseChannelInput("youtube.com/user/LegacyName")).toEqual({
			kind: "username",
			value: "LegacyName",
		});
		expect(parseChannelInput("https://www.youtube.com/c/SomeCustom")).toEqual({
			kind: "handle",
			value: "SomeCustom",
		});
	});

	it("returns null for unusable input", () => {
		expect(parseChannelInput("")).toBeNull();
		expect(parseChannelInput("https://www.youtube.com/")).toBeNull();
	});
});
