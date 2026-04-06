import { fireEvent, render, waitFor } from "@testing-library/react";
import { useState } from "react";

import { NumberField } from "./number-field";

function NumberFieldHarness() {
  const [value, setValue] = useState<number | null>(5);

  return (
    <NumberField allowOutOfRange inputClassName="w-full" onValueChange={setValue} value={value} />
  );
}

describe("NumberField", () => {
  it("keeps controlled state in sync when the Base UI root handles paste", async () => {
    const { container } = render(<NumberFieldHarness />);
    const input = container.querySelector("input");

    expect(input).not.toBeNull();
    expect(input).toHaveValue("5");

    fireEvent.paste(input as HTMLInputElement, {
      clipboardData: {
        getData: (type: string) => (type === "text/plain" ? "12" : ""),
      },
    });

    await waitFor(() => {
      expect(input).toHaveValue("12");
    });
  });

  it("forwards aria-invalid to the actual input element", () => {
    const { container } = render(<NumberField aria-invalid value={5} />);
    const input = container.querySelector("input");

    expect(input).not.toBeNull();
    expect(input).toHaveAttribute("aria-invalid", "true");
  });
});
