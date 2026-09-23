"use client";

// Vendored from Vercel AI Elements (Apache-2.0), packages/elements/src/conversation.tsx at
// 6a9d5b1822ffb10bba4bd97175f01edd7d8651cd. The verbatim original is ./upstream/conversation.tsx.txt
// and ./NOTICE lists every local substitution. Only imports are swapped and `ai-conversation*`
// classes appended beside the inert Tailwind strings; the components are otherwise upstream's.
import { Button } from "./ui/button";
import { cn } from "./lib/utils";
import type { UIMessage } from "./ai-types";
import { ArrowDownIcon, DownloadIcon } from "./icons";
import type { ComponentProps } from "react";
import { useCallback } from "react";
import { StickToBottom, useStickToBottomContext } from "./stick-to-bottom";
import { RollingNumber } from "../picks/chat/rolling-number";
import { AnimatedIcon } from "../picks/chat/animated-icon";
import "./conversation.css";

export type ConversationProps = ComponentProps<typeof StickToBottom>;

export const Conversation = ({ className, ...props }: ConversationProps) => (
  <StickToBottom
    className={cn("relative flex-1 overflow-y-hidden ai-conversation", className)}
    initial="smooth"
    resize="smooth"
    role="log"
    {...props}
  />
);

export type ConversationContentProps = ComponentProps<
  typeof StickToBottom.Content
>;

export const ConversationContent = ({
  className,
  ...props
}: ConversationContentProps) => (
  <StickToBottom.Content
    className={cn("flex flex-col gap-8 p-4 ai-conversation__content", className)}
    {...props}
  />
);

export type ConversationEmptyStateProps = ComponentProps<"div"> & {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
};

export const ConversationEmptyState = ({
  className,
  title = "No messages yet",
  description = "Start a conversation to see messages here",
  icon,
  children,
  ...props
}: ConversationEmptyStateProps) => (
  <div
    className={cn(
      "flex size-full flex-col items-center justify-center gap-3 p-8 text-center ai-conversation__empty",
      className
    )}
    {...props}
  >
    {children ?? (
      <>
        {icon && <div className="text-muted-foreground ai-conversation__empty-icon">{icon}</div>}
        <div className="space-y-1 ai-conversation__empty-copy">
          <h3 className="font-medium text-sm ai-conversation__empty-title">{title}</h3>
          {description && (
            <p className="text-muted-foreground text-sm ai-conversation__empty-description">{description}</p>
          )}
        </div>
      </>
    )}
  </div>
);

export type ConversationScrollButtonProps = ComponentProps<typeof Button>;

export const ConversationScrollButton = ({
  className,
  ...props
}: ConversationScrollButtonProps) => {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();
  // LOCAL: the count the workspace hands over as `data-unseen` ("3 new") is drawn here rather than
  // by a CSS `attr()`, so its figure can roll (picks/chat/rolling-number) and a live dot can ping
  // beside it — Eldora UI "Live Button" (MIT, re-implemented in conversation.css: the ping, a sheen
  // across the pill on hover and an accent glow). The attribute stays on the button as given.
  const unseen = Number.parseInt(String((props as Record<string, unknown>)["data-unseen"] ?? ""), 10);
  const hasUnseen = Number.isFinite(unseen) && unseen > 0;

  const handleScrollToBottom = useCallback(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  return (
    !isAtBottom && (
      <Button
        className={cn(
          "absolute bottom-4 left-[50%] translate-x-[-50%] rounded-full dark:bg-background dark:hover:bg-muted ai-conversation__scroll-button",
          className
        )}
        onClick={handleScrollToBottom}
        size="icon"
        type="button"
        variant="outline"
        {...props}
      >
        <AnimatedIcon motion="drop">
          <ArrowDownIcon className="size-4 ai-conversation__scroll-icon" />
        </AnimatedIcon>
        {hasUnseen && (
          <span className="ai-conversation__scroll-count" aria-hidden="true">
            <span className="ai-conversation__live" />
            <RollingNumber value={unseen} /> new
          </span>
        )}
      </Button>
    )
  );
};

const getMessageText = (message: UIMessage): string =>
  message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");

export type ConversationDownloadProps = Omit<
  ComponentProps<typeof Button>,
  "onClick"
> & {
  messages: UIMessage[];
  filename?: string;
  formatMessage?: (message: UIMessage, index: number) => string;
};

const defaultFormatMessage = (message: UIMessage): string => {
  const roleLabel =
    message.role.charAt(0).toUpperCase() + message.role.slice(1);
  return `**${roleLabel}:** ${getMessageText(message)}`;
};

export const messagesToMarkdown = (
  messages: UIMessage[],
  formatMessage: (
    message: UIMessage,
    index: number
  ) => string = defaultFormatMessage
): string => messages.map((msg, i) => formatMessage(msg, i)).join("\n\n");

export const ConversationDownload = ({
  messages,
  filename = "conversation.md",
  formatMessage = defaultFormatMessage,
  className,
  children,
  ...props
}: ConversationDownloadProps) => {
  const handleDownload = useCallback(() => {
    const markdown = messagesToMarkdown(messages, formatMessage);
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [messages, filename, formatMessage]);

  return (
    <Button
      className={cn(
        "absolute top-4 right-4 rounded-full dark:bg-background dark:hover:bg-muted ai-conversation__download",
        className
      )}
      onClick={handleDownload}
      size="icon"
      type="button"
      variant="outline"
      {...props}
    >
      {children ?? <DownloadIcon className="size-4" />}
    </Button>
  );
};
