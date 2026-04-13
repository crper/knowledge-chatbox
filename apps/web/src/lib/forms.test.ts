import { fieldError, getFirstFormError, translateFieldErrors } from "./forms";

describe("forms helpers", () => {
  describe("translateFieldErrors", () => {
    it("translates object errors with message property", () => {
      const errors = [{ message: "required" }, { message: "tooShort" }];
      expect(
        translateFieldErrors(errors, (key) => ({ required: "必填", tooShort: "太短" })[key] ?? key),
      ).toEqual([{ message: "必填" }, { message: "太短" }]);
    });

    it("handles string errors directly", () => {
      const errors = ["required", "tooShort"];
      expect(
        translateFieldErrors(errors, (key) => ({ required: "必填", tooShort: "太短" })[key] ?? key),
      ).toEqual([{ message: "必填" }, { message: "太短" }]);
    });

    it("filters out null entries", () => {
      const errors = [{ message: "required" }, null, "tooShort"];
      expect(translateFieldErrors(errors)).toEqual([
        { message: "required" },
        { message: "tooShort" },
      ]);
    });

    it("returns messages as-is when no translator provided", () => {
      const errors = [{ message: "required" }];
      expect(translateFieldErrors(errors)).toEqual([{ message: "required" }]);
    });
  });

  describe("getFirstFormError", () => {
    it("extracts message from string error", () => {
      expect(getFirstFormError("some error")).toBe("some error");
    });

    it("extracts message from object with message property", () => {
      expect(getFirstFormError({ message: "some error" })).toBe("some error");
    });

    it("recursively extracts message from nested form error", () => {
      expect(getFirstFormError({ form: { message: "nested error" } })).toBe("nested error");
    });

    it("translates message when translator provided", () => {
      expect(getFirstFormError("required", (_key) => "必填")).toBe("必填");
    });

    it("returns null for null/undefined", () => {
      expect(getFirstFormError(null)).toBeNull();
      expect(getFirstFormError(undefined)).toBeNull();
    });
  });

  describe("fieldError", () => {
    it("returns single-item array when message is provided", () => {
      expect(fieldError("some error")).toEqual([{ message: "some error" }]);
    });

    it("returns empty array when message is undefined", () => {
      expect(fieldError(undefined)).toEqual([]);
    });

    it("returns empty array when message is empty string", () => {
      expect(fieldError("")).toEqual([]);
    });
  });
});
