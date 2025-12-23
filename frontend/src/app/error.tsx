'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Application Error:', error);

    // Auto-reload on ChunkLoadError (usually caused by deployment updates)
    if (
      error.name === 'ChunkLoadError' || 
      error.message.includes('Loading chunk') ||
      error.message.includes('ChunkLoadError')
    ) {
       console.log('Reloading due to ChunkLoadError...');
       window.location.reload();
    }
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] p-4 text-center">
      <div className="bg-red-50 p-6 rounded-lg border border-red-100 max-w-md">
        <h2 className="text-xl font-bold text-red-600 mb-2">Algo salió mal</h2>
        <p className="text-gray-600 mb-6 text-sm">
          Ha ocurrido un error al cargar la aplicación. Si el problema persiste, por favor recarga la página.
        </p>
        <div className="flex gap-3 justify-center">
            <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors text-sm"
            >
                Recargar página
            </button>
            <button
                onClick={() => reset()}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm"
            >
                Intentar de nuevo
            </button>
        </div>
      </div>
    </div>
  );
}
