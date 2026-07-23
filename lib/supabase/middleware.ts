import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

function isAuthPath(pathname: string) {
  return pathname.startsWith('/login') || pathname.startsWith('/signup')
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

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
          supabaseResponse = NextResponse.next({
            request,
          })
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
    return NextResponse.redirect(url)
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
        return NextResponse.redirect(url)
      }
    } catch (error) {
      console.error('Access check failed in middleware:', error)
      // Fail closed for app routes if we cannot verify access
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.search = 'reason=access'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}
