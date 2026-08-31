import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase, isSupabaseConfigured, LS_COMPANY_ID } from "../lib/supabaseClient";
import {
  ensureCompanyProfile,
  fetchMyProfile,
  listWorkers,
  listWorkersForStaffLogin,
  managerPinIsSet,
  throwIfError,
  toErrorMessage,
  workerToPersona
} from "../services/teresitaSupabase";

const TeresitaSupabaseContext = createContext(null);

export function TeresitaSupabaseProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [managerPinReady, setManagerPinReady] = useState(false);
  const [workers, setWorkers] = useState([]);
  const [staffWorkers, setStaffWorkers] = useState([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [initError, setInitError] = useState(null);
  const [companyId, setCompanyId] = useState(() =>
    isSupabaseConfigured ? localStorage.getItem(LS_COMPANY_ID) : null
  );
  const busyRef = useRef(false);

  const refreshWorkers = useCallback(async () => {
    const rows = await listWorkers();
    setWorkers(rows.map(workerToPersona));
  }, []);

  const refreshStaffWorkers = useCallback(async (cid) => {
    const id = cid || localStorage.getItem(LS_COMPANY_ID);
    if (!id) return;
    const rows = await listWorkersForStaffLogin(id);
    setStaffWorkers(rows.map(workerToPersona));
  }, []);

  const refreshSessionState = useCallback(async (opts = {}) => {
    const silent = Boolean(opts.silent);
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }
    if (busyRef.current) return;
    busyRef.current = true;
    if (!silent) {
      setLoading(true);
    }
    setInitError(null);
    try {
      const { data: sess, error: sessErr } = await supabase.auth.getSession();
      throwIfError(sessErr);
      const currentSession = sess?.session ?? null;
      setSession(currentSession);

      if (currentSession) {
        let prof = await fetchMyProfile(currentSession.user.id);
        if (!prof?.company_id) {
          try {
            await ensureCompanyProfile();
          } catch (err) {
            const msg = String(err?.message || "");
            if (msg.includes("AUTH_USER_NOT_FOUND")) {
              await supabase.auth.signOut();
              localStorage.removeItem(LS_COMPANY_ID);
              setSession(null);
              setProfile(null);
              setManagerPinReady(false);
              setWorkers([]);
              setStaffWorkers([]);
              setCompanyId(null);
              return;
            }
            throw err;
          }
          prof = await fetchMyProfile(currentSession.user.id);
        }
        setProfile(prof);
        const cid = prof?.company_id || localStorage.getItem(LS_COMPANY_ID);
        if (cid) {
          setCompanyId(cid);
          localStorage.setItem(LS_COMPANY_ID, cid);
        }
        let pinSet = false;
        if (prof?.company_id) {
          pinSet = await managerPinIsSet();
        }
        setManagerPinReady(pinSet);
        if (pinSet) {
          const rows = await listWorkers();
          setWorkers(rows.map(workerToPersona));
        } else {
          setWorkers([]);
        }
        if (cid) {
          try {
            const rows = await listWorkersForStaffLogin(cid);
            setStaffWorkers(rows.map(workerToPersona));
          } catch {
            setStaffWorkers([]);
          }
        }
      } else {
        setProfile(null);
        setManagerPinReady(false);
        setWorkers([]);
        const cid = localStorage.getItem(LS_COMPANY_ID);
        if (cid) {
          setCompanyId(cid);
          try {
            const rows = await listWorkersForStaffLogin(cid);
            setStaffWorkers(rows.map(workerToPersona));
          } catch {
            localStorage.removeItem(LS_COMPANY_ID);
            setStaffWorkers([]);
          }
        } else {
          setStaffWorkers([]);
        }
      }
    } catch (err) {
      console.error("Teresita Supabase init:", err);
      setInitError(toErrorMessage(err));
    } finally {
      busyRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSessionState();
    if (!supabase) return undefined;
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "INITIAL_SESSION") return;
      // Safari refocus often fires TOKEN_REFRESHED / SIGNED_IN — keep the app mounted.
      const silent = event !== "SIGNED_OUT";
      refreshSessionState({ silent });
    });
    return () => subscription.unsubscribe();
  }, [refreshSessionState]);

  const value = useMemo(
    () => ({
      enabled: isSupabaseConfigured,
      loading,
      initError,
      session,
      profile,
      companyId,
      companyName: profile?.companies?.name || "",
      adminNotifyEmail:
        profile?.companies?.admin_notification_email ||
        process.env.REACT_APP_ADMIN_NOTIFY_EMAIL ||
        "emiliaabravo19@gmail.com",
      managerPinReady,
      setManagerPinReady,
      workers,
      staffWorkers,
      refreshWorkers,
      refreshStaffWorkers,
      refreshSessionState
    }),
    [
      loading,
      initError,
      session,
      profile,
      companyId,
      managerPinReady,
      workers,
      staffWorkers,
      refreshWorkers,
      refreshStaffWorkers,
      refreshSessionState
    ]
  );

  return (
    <TeresitaSupabaseContext.Provider value={value}>{children}</TeresitaSupabaseContext.Provider>
  );
}

export function useTeresitaSupabase() {
  const ctx = useContext(TeresitaSupabaseContext);
  if (!ctx) {
    return {
      enabled: false,
      loading: false,
      initError: null,
      session: null,
      profile: null,
      companyId: null,
      companyName: "",
      adminNotifyEmail: "emiliaabravo19@gmail.com",
      managerPinReady: true,
      workers: [],
      staffWorkers: [],
      refreshWorkers: async () => {},
      refreshStaffWorkers: async () => {},
      refreshSessionState: async () => {}
    };
  }
  return ctx;
}
