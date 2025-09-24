"use client";
import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

type ToastType = "success" | "error" | "info" | "warning";
type Toast = { id: string; title?: string; description?: string; type?: ToastType; duration?: number };

type ToastContextValue = {
    show: (t: Omit<Toast, "id">) => void;
    success: (msg: string, desc?: string) => void;
    error: (msg: string, desc?: string) => void;
    info: (msg: string, desc?: string) => void;
    warning: (msg: string, desc?: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error("useToast debe usarse dentro de <ToastProvider>");
    return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const remove = useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const show = useCallback((t: Omit<Toast, "id">) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const toast: Toast = { id, duration: 4000, type: "info", ...t };
        setToasts((prev) => [...prev, toast]);
        const timeout = setTimeout(() => remove(id), toast.duration);
        // Clean up in case component unmounts quickly
        return () => clearTimeout(timeout);
    }, [remove]);

    const api = useMemo<ToastContextValue>(() => ({
        show,
        success: (msg, desc) => show({ title: msg, description: desc, type: "success" }),
        error: (msg, desc) => show({ title: msg, description: desc, type: "error" }),
        info: (msg, desc) => show({ title: msg, description: desc, type: "info" }),
        warning: (msg, desc) => show({ title: msg, description: desc, type: "warning" }),
    }), [show]);

    return (
        <ToastContext.Provider value={api}>
            {children}
            {/* Container */}
            <div className="fixed top-4 right-4 z-[1000] space-y-2 max-w-sm">
                {toasts.map((t) => (
                    <div
                        key={t.id}
                        className={[
                            "rounded-lg shadow px-4 py-3 text-sm border",
                            t.type === "success" && "bg-green-50 border-green-200 text-green-800",
                            t.type === "error" && "bg-red-50 border-red-200 text-red-800",
                            t.type === "warning" && "bg-yellow-50 border-yellow-200 text-yellow-800",
                            t.type === "info" && "bg-blue-50 border-blue-200 text-blue-800",
                        ].filter(Boolean).join(" ")}
                    >
                        <div className="flex justify-between items-start gap-3">
                            <div className="flex-1">
                                {t.title && <div className="font-semibold mb-0.5">{t.title}</div>}
                                {t.description && <div className="opacity-90">{t.description}</div>}
                            </div>
                            <button
                                className="opacity-60 hover:opacity-100"
                                aria-label="Cerrar"
                                onClick={() => remove(t.id)}
                            >
                                ×
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}
