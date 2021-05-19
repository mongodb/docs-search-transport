import { strictEqual, deepStrictEqual, strict } from "assert"
import { joinUrl } from "./SearchIndex"

describe("SearchIndex", function() {
    it("correctly joins base URLs with slugs", function() {
        strictEqual(joinUrl("https://example.com//", "//foo/"), "https://example.com/foo/")
        strictEqual(joinUrl("https://example.com", "foo"), "https://example.com/foo")
    })
})
