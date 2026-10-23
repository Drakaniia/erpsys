import ChatInput from "../ChatInput";
import ChatInputTextArea from "../ChatInputTextArea";
import ChatInputSubmit from "../ChatInputSubmit";

export default function PromptInput({
  value,
  onchange,
  onsubmit,
  loading = false,
  onstop,
  minRows = 2,
  placeholder = "Ask a question…",
}: {
  value: string;
  onchange: (value: string) => void;
  onsubmit?: (value: string) => void | Promise<void>;
  loading?: boolean;
  onstop?: () => void;
  minRows?: number;
  placeholder?: string;
}) {
  function handleSubmit() {
    const text = value.trim();
    if (text.length === 0) return;
    onsubmit?.(text);
  }

  return (
    <ChatInput
      value={value}
      loading={loading}
      onchange={onchange}
      onsubmit={handleSubmit}
      onstop={onstop}
      rows={minRows}
    >
      <div className="flex w-full items-end gap-2">
        <ChatInputTextArea
          placeholder={placeholder}
          style={{ maxHeight: "12rem" }}
        />
        <ChatInputSubmit />
      </div>
    </ChatInput>
  );
}
