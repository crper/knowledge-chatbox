import { formError, getFormErrorMessages, handleFormSubmitEvent } from "./forms";

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

  it("translates namespaced string keys with inline params when extracting display messages", () => {
    expect(
      getFormErrorMessages(["auth:passwordLengthValidationError:12"], (key, values) => {
        if (key === "auth:passwordLengthValidationError") {
          const min =
            typeof values?.min === "number" || typeof values?.min === "string" ? values.min : "";
          return `密码至少需要 ${min} 位。`;
        }
        return key;
      }),
    ).toEqual(["密码至少需要 12 位。"]);
  });
});
