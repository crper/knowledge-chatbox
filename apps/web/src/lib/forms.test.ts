import {
  formError,
  getFormErrorMessages,
  handleFormSubmitEvent,
  isValidHttpUrl,
  minLength,
  positiveIntegerInRange,
  trimmedRequired,
} from "./forms";

describe("forms helpers", () => {
  it("prevents the native submit and awaits successful form handlers", async () => {
    const preventDefault = vi.fn();
    const submit = vi.fn().mockResolvedValue(undefined);

    await handleFormSubmitEvent({ preventDefault } as Pick<Event, "preventDefault">, submit);

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("suppresses rejected submit promises so form components can surface their own errors", async () => {
    const preventDefault = vi.fn();
    const submit = vi.fn().mockRejectedValue(new Error("bad request"));

    await expect(
      handleFormSubmitEvent({ preventDefault } as Pick<Event, "preventDefault">, submit),
    ).resolves.toBeUndefined();

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("returns a structured error when trimmedRequired receives only whitespace", () => {
    expect(trimmedRequired("   ", "requiredFieldError")).toEqual(formError("requiredFieldError"));
    expect(trimmedRequired("  value  ", "requiredFieldError")).toBeUndefined();
  });

  it("returns a structured error when minLength is below the boundary", () => {
    expect(minLength("1234567", 8, "passwordLengthValidationError")).toEqual(
      formError("passwordLengthValidationError", { min: 8 }),
    );
    expect(minLength("12345678", 8, "passwordLengthValidationError")).toBeUndefined();
  });

  it("validates optional http/https urls without accepting other protocols", () => {
    expect(isValidHttpUrl("", "urlInvalidError")).toBeUndefined();
    expect(isValidHttpUrl("https://api.openai.com/v1", "urlInvalidError")).toBeUndefined();
    expect(isValidHttpUrl("http://localhost:11434", "urlInvalidError")).toBeUndefined();
    expect(isValidHttpUrl("ftp://example.com", "urlInvalidError")).toEqual(
      formError("urlInvalidError"),
    );
    expect(isValidHttpUrl("api.openai.com/v1", "urlInvalidError")).toEqual(
      formError("urlInvalidError"),
    );
  });

  it("validates positive integers inside an inclusive range", () => {
    expect(positiveIntegerInRange(0, 1, 600, "providerTimeoutInvalidError")).toEqual(
      formError("providerTimeoutInvalidError", { max: 600, min: 1 }),
    );
    expect(positiveIntegerInRange(1, 1, 600, "providerTimeoutInvalidError")).toBeUndefined();
    expect(positiveIntegerInRange(600, 1, 600, "providerTimeoutInvalidError")).toBeUndefined();
    expect(positiveIntegerInRange(601, 1, 600, "providerTimeoutInvalidError")).toEqual(
      formError("providerTimeoutInvalidError", { max: 600, min: 1 }),
    );
    expect(positiveIntegerInRange("12.5", 1, 600, "providerTimeoutInvalidError")).toEqual(
      formError("providerTimeoutInvalidError", { max: 600, min: 1 }),
    );
  });

  it("translates structured errors when extracting display messages", () => {
    expect(
      getFormErrorMessages(
        [
          formError("usernameRequiredError"),
          { form: formError("passwordRequiredError") },
          "raw message",
        ],
        (key) =>
          ({
            passwordRequiredError: "请输入密码。",
            usernameRequiredError: "请输入用户名。",
          })[key] ?? key,
      ),
    ).toEqual(["请输入用户名。", "请输入密码。", "raw message"]);
  });
});
