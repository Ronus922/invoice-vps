"use client";

import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { AppCard, AppFlex } from "./AppComponents";
import { Sparkles, User, BrainCircuit, Mic } from "lucide-react";

// --- Types ---

export type AgentStatus = "idle" | "thinking" | "speaking";

interface AgentAvatarProps {
  src?: string;
  status?: AgentStatus;
  size?: "sm" | "md" | "lg";
  className?: string;
}

interface AgentMessageProps {
  role: "user" | "ai" | "system";
  children: React.ReactNode;
  timestamp?: string;
  className?: string;
}

interface AgentScaleProps {
  label: string;
  value: number;
  color?: "blue" | "green" | "yellow" | "red";
  className?: string;
}

// --- 1. Agent Avatar ---

export const AgentAvatar = ({
  src,
  status = "idle",
  size = "md",
  className,
}: AgentAvatarProps) => {
  const sizeClasses = {
    sm: "w-8 h-8",
    md: "w-12 h-12",
    lg: "w-16 h-16",
  };

  return (
    <div className={cn("relative inline-block", className)}>
      {status === "thinking" && (
        <span className="absolute inset-0 -m-1 rounded-full border-2 border-yellow-400/50 animate-pulse" />
      )}
      {status === "speaking" && (
        <span className="absolute inset-0 -m-1 rounded-full border-2 border-green-500/50 shadow-[0_0_15px_rgba(34,197,94,0.4)]" />
      )}

      <div
        className={cn(
          "relative overflow-hidden rounded-full border bg-background flex items-center justify-center",
          "transition-all duration-300",
          sizeClasses[size],
          status === "idle" && "border-border",
          status === "thinking" && "border-yellow-400",
          status === "speaking" && "border-green-500"
        )}
      >
        {src ? (
          <img
            src={src}
            alt="Agent Avatar"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="text-muted-foreground">
            {status === "thinking" ? (
              <BrainCircuit className="w-1/2 h-1/2 animate-pulse" />
            ) : status === "speaking" ? (
              <Mic className="w-1/2 h-1/2" />
            ) : (
              <Sparkles className="w-1/2 h-1/2" />
            )}
          </div>
        )}
      </div>

      <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
        {status !== "idle" && (
          <span
            className={cn(
              "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
              status === "thinking" ? "bg-yellow-400" : "bg-green-500"
            )}
          />
        )}
        <span
          className={cn(
            "relative inline-flex rounded-full h-3 w-3 border-2 border-background",
            status === "idle" && "bg-gray-400",
            status === "thinking" && "bg-yellow-500",
            status === "speaking" && "bg-green-500"
          )}
        />
      </span>
    </div>
  );
};

// --- 2. Agent Message ---

export const AgentMessage = ({
  role,
  children,
  timestamp,
  className,
}: AgentMessageProps) => {
  const isUser = role === "user";
  const isSystem = role === "system";

  if (isSystem) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex w-full justify-center my-4"
      >
        <span className="text-xs text-muted-foreground bg-muted/50 px-3 py-1 rounded-full">
          {children}
        </span>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={cn(
        "flex w-full mb-4 gap-3",
        isUser ? "flex-row-reverse" : "flex-row",
        className
      )}
    >
      <div className="flex-shrink-0 mt-1">
        {isUser ? (
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
            <User className="w-4 h-4 text-primary" />
          </div>
        ) : (
          <AgentAvatar size="sm" status="idle" />
        )}
      </div>

      <div
        className={cn(
          "max-w-[80%] p-4 shadow-sm text-sm leading-relaxed relative group",
          isUser
            ? "bg-primary text-primary-foreground rounded-2xl rounded-tr-sm"
            : "bg-card text-card-foreground border border-border rounded-2xl rounded-tl-sm"
        )}
      >
        {children}

        {timestamp && (
          <span className="text-[10px] opacity-0 group-hover:opacity-70 transition-opacity absolute bottom-1 px-2">
            {timestamp}
          </span>
        )}
      </div>
    </motion.div>
  );
};

// --- 3. Agent Scale ---

export const AgentScale = ({
  label,
  value,
  color = "blue",
  className,
}: AgentScaleProps) => {
  const colorStyles = {
    blue: "bg-blue-600 dark:bg-blue-400",
    green: "bg-emerald-600 dark:bg-emerald-400",
    yellow: "bg-amber-500 dark:bg-amber-400",
    red: "bg-rose-600 dark:bg-rose-400",
  };

  return (
    <div
      className={cn(
        "w-full p-3 rounded-lg border border-border/50 bg-background/50 backdrop-blur-sm space-y-2",
        className
      )}
    >
      <AppFlex between className="w-full">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className="text-xs font-mono font-medium">{value}%</span>
      </AppFlex>

      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, Math.max(0, value))}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
          className={cn("h-full rounded-full", colorStyles[color])}
        />
      </div>
    </div>
  );
};
