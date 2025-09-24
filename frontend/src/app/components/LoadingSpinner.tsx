"use client";
import React from "react";

export function LoadingSpinner({ label = "Cargando…" }: { label?: string }) {
    return (
        <div className="flex flex-col items-center justify-center gap-3">
            <div className="h-10 w-10 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin" aria-label="loading" />
            <div className="text-sm text-blue-700 font-medium">{label}</div>
        </div>
    );
}
