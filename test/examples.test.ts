import { describe, expect, test } from "bun:test";
import { validateRecords } from "../src/validate";
import { RESOURCES } from "../src/types";
import { loadExample } from "./fixtures";

describe("examples", () => {
  for (const resource of RESOURCES) {
    test(`${resource} examples conform`, () => {
      expect(validateRecords(resource, loadExample(resource))).toEqual([]);
    });
  }
});
