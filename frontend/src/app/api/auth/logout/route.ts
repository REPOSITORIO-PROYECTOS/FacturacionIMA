export async function POST(): Promise<Response> {
    // Invalida la cookie session_token enviándola expirada
    return new Response(JSON.stringify({ detail: 'Logout OK' }), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            'Set-Cookie': 'session_token=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax'
        }
    });
}

export async function GET(): Promise<Response> {
    return new Response(JSON.stringify({ detail: 'Use POST para logout' }), { status: 405 });
}