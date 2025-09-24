import React from 'react';
import { LoadingSpinner } from './components/LoadingSpinner';

export default function GlobalLoading() {
    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50">
            <LoadingSpinner label="Cargando aplicación…" />
        </div>
    );
}
