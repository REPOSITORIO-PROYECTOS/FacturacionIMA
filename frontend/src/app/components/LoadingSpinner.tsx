"use client";
import React from "react";

export function LoadingSpinner({ label = "Cargando…", size = "md" }: { label?: string; size?: "sm" | "md" | "lg" }) {
    const sizeClasses = {
        sm: "h-4 w-4 border-2",
        md: "h-10 w-10 border-4",
        lg: "h-16 w-16 border-4"
    };

    return (
        <div className={`flex flex-col items-center justify-center gap-2 ${size === "sm" ? "inline-flex flex-row" : ""}`}>
            <div className={`${sizeClasses[size]} rounded-full border-blue-200 border-t-blue-600 animate-spin`} aria-label="loading" />
            {label && size !== "sm" && <div className="text-sm text-blue-700 font-medium">{label}</div>}
        </div>
    );
}
