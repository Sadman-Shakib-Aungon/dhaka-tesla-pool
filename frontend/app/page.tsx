"use client";

import { FormEvent, useEffect, useState } from "react";
import "./globals.css";

const API = "http://localhost:4000/api";
const money = (paisa: number) => `৳${Math.round(paisa / 100)}`;
const label = (value: string) => value.replaceAll("_", " ");

type User = { id: string; name: string; phone: string; role: "PASSENGER" | "DRIVER" };
type Session = { token: string; user: User };

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [registerMode, setRegisterMode] = useState(false);
  const [areas, setAreas] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [auth, setAuth] = useState({ name: "", phone: "", password: "", role: "PASSENGER", vehicleName: "", plateNo: "", capacity: 3 });
  const [ride, setRide] = useState({ pickup: "Banani", destination: "Mohakhali", requestedSeats: 1 });
  const [rides, setRides] = useState<any[]>([]);
  const [dashboard, setDashboard] = useState<any>(null);
  const [balance, setBalance] = useState(0);

  const headers = () => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${session?.token}`,
  });

  async function request(path: string, options: RequestInit = {}) {
    const response = await fetch(`${API}${path}`, options);
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Request failed.");
    return data;
  }

  async function refresh() {
    try {
      const boot = await request("/bootstrap");
      setAreas(boot.areas);
      if (!session) return;
      const wallet = await request("/wallet", { headers: headers() });
      setBalance(wallet.balancePaisa);
      if (session.user.role === "PASSENGER") {
        setRides(await request("/rides", { headers: headers() }));
      } else {
        setDashboard(await request("/driver/dashboard", { headers: headers() }));
      }
    } catch (error: any) {
      setMessage(error.message);
    }
  }

  useEffect(() => {
    const saved = localStorage.getItem("tesla-pool-session");
    if (saved) setSession(JSON.parse(saved));
    request("/bootstrap").then((data) => setAreas(data.areas)).catch(() => setMessage("Backend is not running on port 4000."));
  }, []);

  useEffect(() => {
    if (!session) return;
    refresh();
    const timer = window.setInterval(refresh, 3000);
    return () => window.clearInterval(timer);
  }, [session]);

  function saveSession(next: Session) {
    localStorage.setItem("tesla-pool-session", JSON.stringify(next));
    setSession(next);
    setMessage(`Welcome, ${next.user.name}.`);
  }

  async function submitAuth(event: FormEvent) {
    event.preventDefault();
    try {
      const path = registerMode ? "/auth/register" : "/auth/login";
      const body = registerMode ? auth : { phone: auth.phone, password: auth.password };
      saveSession(await request(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
    } catch (error: any) { setMessage(error.message); }
  }

  async function createRide(event: FormEvent) {
    event.preventDefault();
    try {
      const result = await request("/rides", { method: "POST", headers: headers(), body: JSON.stringify(ride) });
      setMessage(`Ride requested. Estimated fare: ${money(result.farePaisa)}`);
      refresh();
    } catch (error: any) { setMessage(error.message); }
  }

  async function action(path: string, method = "POST", body?: object) {
    try {
      await request(path, { method, headers: headers(), body: body ? JSON.stringify(body) : undefined });
      setMessage("Ride updated successfully.");
      refresh();
    } catch (error: any) { setMessage(error.message); }
  }

  function logout() {
    localStorage.removeItem("tesla-pool-session");
    setSession(null);
    setRides([]);
    setDashboard(null);
    setMessage("Signed out.");
  }

  if (!session) {
    return (
      <main>
        <section className="hero">
          <div><p className="eyebrow">DHAKA • SHARED ELECTRIC RIDES</p><h1>Tesla Pool<span>.</span></h1><p className="subtitle">Sign in or create your own passenger or driver account.</p></div>
        </section>
        {message && <div className="notice">{message}</div>}
        <section className="panel auth-panel">
          <p className="eyebrow">{registerMode ? "CREATE ACCOUNT" : "WELCOME BACK"}</p>
          <h2>{registerMode ? "Join Tesla Pool" : "Sign in to continue"}</h2>
          <form onSubmit={submitAuth}>
            {registerMode && <label>Full name<input required value={auth.name} onChange={(e) => setAuth({ ...auth, name: e.target.value })} /></label>}
            <label>Mobile number<input required placeholder="01XXXXXXXXX" value={auth.phone} onChange={(e) => setAuth({ ...auth, phone: e.target.value })} /></label>
            <label>Password<input required type="password" minLength={6} value={auth.password} onChange={(e) => setAuth({ ...auth, password: e.target.value })} /></label>
            {registerMode && <>
              <label>Account type
                <select value={auth.role} onChange={(e) => setAuth({ ...auth, role: e.target.value })}>
                  <option value="PASSENGER">Passenger</option>
                  <option value="DRIVER">Driver</option>
                </select>
              </label>
              {auth.role === "DRIVER" && <div className="two-col">
                <label>Vehicle name<input required value={auth.vehicleName} onChange={(e) => setAuth({ ...auth, vehicleName: e.target.value })} /></label>
                <label>Plate number<input required value={auth.plateNo} onChange={(e) => setAuth({ ...auth, plateNo: e.target.value })} /></label>
              </div>}
            </>}
            <button className="primary" type="submit">{registerMode ? "Create account →" : "Sign in →"}</button>
          </form>
          <button className="text-button" onClick={() => setRegisterMode(!registerMode)}>
            {registerMode ? "Already have an account? Sign in" : "New here? Create an account"}
          </button>
          <p className="demo-note">PRD demo accounts remain available for evaluation: use their registered mobile number and password <code>demo1234</code>.</p>
        </section>
      </main>
    );
  }

  return (
    <main>
      <section className="hero compact">
        <div><p className="eyebrow">{session.user.role} PORTAL</p><h1>Tesla Pool<span>.</span></h1><p className="subtitle">Signed in as {session.user.name} · Wallet balance: {money(balance)}</p></div>
        <button className="logout" onClick={logout}>Sign out</button>
      </section>
      {message && <div className="notice">{message}</div>}

      {session.user.role === "PASSENGER" ? (
        <section className="grid">
          <div className="panel request">
            <p className="eyebrow">BOOK A POOL RIDE</p><h2>Where are you going?</h2>
            <form onSubmit={createRide}>
              <div className="two-col">
                <label>Pickup<select value={ride.pickup} onChange={(e) => setRide({ ...ride, pickup: e.target.value })}>{areas.map((a) => <option key={a}>{a}</option>)}</select></label>
                <label>Destination<select value={ride.destination} onChange={(e) => setRide({ ...ride, destination: e.target.value })}>{areas.map((a) => <option key={a}>{a}</option>)}</select></label>
              </div>
              <label>Seats<div className="seat-picker">{[1, 2, 3].map((n) => <button type="button" key={n} className={ride.requestedSeats === n ? "selected" : ""} onClick={() => setRide({ ...ride, requestedSeats: n })}>{n}</button>)}</div></label>
              <button className="primary">Request shared ride →</button>
            </form>
          </div>
          <div className="panel"><p className="eyebrow">YOUR RIDES</p><h2>Ride history</h2>
            {!rides.length ? <div className="empty">No rides yet.</div> : <div className="ride-list">{rides.map((r) => <article className="ride" key={r.id}>
              <div className="route"><strong>{r.pickup}</strong><span>→</span><strong>{r.destination}</strong></div>
              <div className="ride-meta"><span className={`badge ${r.status.toLowerCase()}`}>{label(r.status)}</span><b>{money(r.farePaisa)}</b><span>{r.requestedSeats} seat(s)</span></div>
              {["REQUESTED", "ACCEPTED"].includes(r.status) && <button className="text-button" onClick={() => action(`/rides/${r.id}/cancel`)}>Cancel ride</button>}
            </article>)}</div>}
          </div>
        </section>
      ) : (
        <section className="driver-layout">
          <div className="driver-top"><div><p className="eyebrow">YOUR VEHICLE</p><h2>{dashboard?.vehicle?.name || "Loading..."}</h2><p>{dashboard?.vehicle?.plateNo}</p></div><div className="capacity"><b>{dashboard ? `${dashboard.availableSeats}/${dashboard.vehicle.capacity}` : "—"}</b><span>seats available</span></div></div>
          <div className="queue">{!dashboard?.vehicle?.rides?.length ? <div className="empty">No active ride requests.</div> : dashboard.vehicle.rides.map((r: any) => <article className="driver-ride" key={r.id}>
            <div className="avatar">{r.passenger.name[0]}</div><div className="driver-info"><strong>{r.passenger.name}</strong><span>{r.pickup} → {r.destination} · {r.requestedSeats} seat(s)</span></div><span className={`badge ${r.status.toLowerCase()}`}>{label(r.status)}</span><b>{money(r.farePaisa)}</b>
            {r.status === "REQUESTED" && <button className="primary small" onClick={() => action(`/rides/${r.id}/accept`)}>Accept</button>}
            {r.status === "ACCEPTED" && <button className="primary small" onClick={() => action(`/rides/${r.id}/status`, "PATCH", { status: "DRIVER_ARRIVED" })}>I arrived</button>}
            {r.status === "DRIVER_ARRIVED" && <button className="primary small" onClick={() => action(`/rides/${r.id}/status`, "PATCH", { status: "STARTED" })}>Start trip</button>}
            {r.status === "STARTED" && <button className="primary small" onClick={() => action(`/rides/${r.id}/status`, "PATCH", { status: "COMPLETED" })}>Complete</button>}
          </article>)}</div>
        </section>
      )}
    </main>
  );
}
