import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

function isAuthPath(pathname: string) {
  return pathname.startsWith('/login') || pathname.startsWith('/signup')
}

function randomNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function supabaseConnectSources(): string {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!raw) return ''
  try {
    const url = new URL(raw)
    const http = `${url.protocol}//${url.host}`
    const ws = `${url.protocol === 'http:' ? 'ws:' : 'wss:'}//${url.host}`
    return `${http} ${ws}`
  } catch {
    return ''
  }
}

function contentSecurityPolicy(nonce: string): string {
  // React refresh in `next dev` compiles with eval. Production does not.
  const scriptSrc =
    process.env.NODE_ENV === 'development'
      ? `'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`
      : `'self' 'nonce-${nonce}' 'strict-dynamic'`
  const connect = supabaseConnectSources()
  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' ${connect}`.trim(),
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ')
}

function stampCsp(response: NextResponse, csp: string): NextResponse {
  response.headers.set('Content-Security-Policy', csp)
  return response
}

export async function updateSession(request: NextRequest) {
  const nonce = randomNonce()
  const csp = contentSecurityPolicy(nonce)
  request.headers.set('x-nonce', nonce)
  request.headers.set('Content-Security-Policy', csp)

  let supabaseResponse = stampCsp(
    NextResponse.next({
      request,
    }),
    csp
  )

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = stampCsp(
            NextResponse.next({
              request,
            }),
            csp
          )
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  let user = null

  try {
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser()
    user = authUser
  } catch (error) {
    // Supabase is unreachable (network/DNS issue, outage, etc.)
    // Allow login/signup pages to render their own error UI.
    // For other pages, redirect to login (where the unavailable message will be shown).
    console.error('Supabase connection failed in middleware:', error)
  }

  const pathname = request.nextUrl.pathname

  if (!user && !isAuthPath(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    return stampCsp(NextResponse.redirect(url), csp)
  }

  // Authenticated but not approved (or access revoked): clear session and send to login
  if (user && !isAuthPath(pathname)) {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('access_to_app')
        .eq('id', user.id)
        .maybeSingle()

      if (profile?.access_to_app !== true) {
        await supabase.auth.signOut()
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        url.search = 'reason=access'
        return stampCsp(NextResponse.redirect(url), csp)
      }
    } catch (error) {
      console.error('Access check failed in middleware:', error)
      // Fail closed for app routes if we cannot verify access
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.search = 'reason=access'
      return stampCsp(NextResponse.redirect(url), csp)
    }
  }

  return supabaseResponse
}
