/**
 * @file 共享文件拖拽选择壳组件。
 */

import type { ReactNode } from "react";
import { useDropzone, type Accept, type FileRejection } from "react-dropzone";

import {
  SUPPORTED_UPLOAD_ACCEPT_MAP,
  validateUploadFile,
} from "@/features/knowledge/upload-file-types";

type FileDropzoneRenderProps = Pick<
  ReturnType<typeof useDropzone>,
  "getInputProps" | "getRootProps" | "isDragAccept" | "isDragActive" | "isDragReject" | "open"
>;

type FileDropzoneProps = {
  accept?: Accept;
  children: (props: FileDropzoneRenderProps) => ReactNode;
  disabled?: boolean;
  multiple?: boolean;
  onFilesAccepted?: (files: File[]) => void;
  onFilesRejected?: (rejections: FileRejection[]) => void;
};

/**
 * 提供统一的 dropzone 行为和受控 API。
 */
export function FileDropzone({
  accept = SUPPORTED_UPLOAD_ACCEPT_MAP,
  children,
  disabled = false,
  multiple = true,
  onFilesAccepted,
  onFilesRejected,
}: FileDropzoneProps) {
  const dropzone = useDropzone({
    accept,
    disabled,
    multiple,
    noClick: true,
    noKeyboard: true,
    onDropAccepted: onFilesAccepted,
    onDropRejected: onFilesRejected,
    preventDropOnDocument: true,
    validator: validateUploadFile,
  });

  return children(dropzone);
}
