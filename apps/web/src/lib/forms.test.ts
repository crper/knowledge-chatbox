import { handleFormSubmitEvent } from "./forms";

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
});
