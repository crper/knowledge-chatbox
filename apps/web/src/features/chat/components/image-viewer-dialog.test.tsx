import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

import { createTestQueryClient } from "@/test/query-client";
import { ImageViewerDialog, type ImageViewerItem } from "./image-viewer-dialog";

const queryClient = createTestQueryClient();

describe("ImageViewerDialog", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(window, "open").mockImplementation(() => null);
    vi.stubGlobal(
      "URL",
      Object.assign(URL, {
        createObjectURL: vi.fn(() => "blob:viewer-preview"),
        revokeObjectURL: vi.fn(),
      }),
    );
  });

  it("renders a local image inside the viewer", async () => {
    const items: ImageViewerItem[] = [
      {
        kind: "local",
        id: "local-image-1",
        name: "draft-image.png",
        mimeType: "image/png",
        file: new File(["image"], "draft-image.png", { type: "image/png" }),
      },
    ];

    render(
      <QueryClientProvider client={queryClient}>
        <ImageViewerDialog items={items} onOpenChange={vi.fn()} open={true} />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("img", { name: "draft-image.png" })).toHaveAttribute(
      "src",
      "blob:viewer-preview",
    );
    expect(screen.getByText("draft-image.png")).toBeInTheDocument();
  });

  it("navigates between remote images and exposes the original file link", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(new Blob(["image"], { type: "image/png" }), {
            status: 200,
          }),
        ),
      ),
    );

    const items: ImageViewerItem[] = [
      {
        kind: "remote",
        id: "remote-image-1",
        name: "history-1.png",
        mimeType: "image/png",
        originalUrl: "http://localhost:8000/api/documents/11/file",
        documentRevisionId: 11,
      },
      {
        kind: "remote",
        id: "remote-image-2",
        name: "history-2.png",
        mimeType: "image/png",
        originalUrl: "http://localhost:8000/api/documents/12/file",
        documentRevisionId: 12,
      },
    ];

    render(
      <QueryClientProvider client={queryClient}>
        <ImageViewerDialog items={items} onOpenChange={vi.fn()} open={true} />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("img", { name: "history-1.png" })).toBeInTheDocument();
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看原图" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "下载图片" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "下一张" }));

    expect(await screen.findByRole("img", { name: "history-2.png" })).toBeInTheDocument();
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "查看原图" }));
    expect(window.open).toHaveBeenCalledWith(
      "blob:viewer-preview",
      "_blank",
      "noopener,noreferrer",
    );
    const lastFetchCall = vi.mocked(fetch).mock.calls.at(-1);
    expect(lastFetchCall).toBeDefined();
    const [requestOrUrl, init] = lastFetchCall!;
    const actualUrl = requestOrUrl instanceof Request ? requestOrUrl.url : requestOrUrl;
    expect(actualUrl).toBe("http://localhost:8000/api/documents/12/file");
    if (requestOrUrl instanceof Request) {
      expect(requestOrUrl.credentials).toBe("include");
    } else {
      expect(init).toMatchObject({
        credentials: "include",
      });
    }
  });

  it("closes the viewer on Escape", async () => {
    const onOpenChange = vi.fn();
    const items: ImageViewerItem[] = [
      {
        kind: "local",
        id: "local-image-1",
        name: "draft-image.png",
        mimeType: "image/png",
        file: new File(["image"], "draft-image.png", { type: "image/png" }),
      },
    ];

    render(
      <QueryClientProvider client={queryClient}>
        <ImageViewerDialog items={items} onOpenChange={onOpenChange} open={true} />
      </QueryClientProvider>,
    );

    await screen.findByRole("img", { name: "draft-image.png" });
    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false, expect.anything());
    });
  });
});
