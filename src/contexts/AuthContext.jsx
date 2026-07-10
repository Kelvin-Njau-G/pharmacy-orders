import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true

    // getSession() reads from localStorage — no network, essentially instant.
    // We stop the spinner as soon as we know whether a user is logged in or not,
    // then load the profile in the background without blocking the UI.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted.current) return
      setUser(session?.user ?? null)
      setLoading(false)                          // ← stop spinner immediately
      if (session?.user) loadProfile(session.user.id)  // profile loads in background
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!mounted.current) return
        if (event === 'INITIAL_SESSION') return  // handled by getSession above
        setUser(session?.user ?? null)
        if (!session?.user) { setProfile(null); setLoading(false) }
        else loadProfile(session.user.id)
      }
    )

    return () => { mounted.current = false; subscription.unsubscribe() }
  }, [])

  async function loadProfile(userId) {
    try {
      const { data } = await supabase
        .from('profiles').select('*').eq('id', userId).single()
      if (mounted.current) setProfile(data)
    } catch (err) {
      console.error('[AuthContext] Failed to load profile:', err)
    }
  }

  async function signIn(email, password) {
    return supabase.auth.signInWithPassword({ email, password })
  }

  async function signOut() {
    return supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{
      user, profile, loading,
      signIn, signOut,
      isAdmin: profile?.role === 'admin',
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
