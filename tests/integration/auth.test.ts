import { beforeAll, describe, expect, it } from "vitest";
import { call } from "../support/api";
import { bootstrap, createUser, lastEmailTo, PASSWORD, tokenFromMessage } from "../support/fixtures";
import { db } from "@/server/db/client";
import * as register from "@/app/api/v1/auth/register/route";
import * as login from "@/app/api/v1/auth/login/route";
import * as logout from "@/app/api/v1/auth/logout/route";
import * as me from "@/app/api/v1/auth/me/route";
import * as refresh from "@/app/api/v1/auth/refresh/route";
import * as forgot from "@/app/api/v1/auth/forgot-password/route";
import * as reset from "@/app/api/v1/auth/reset-password/route";
import * as verify from "@/app/api/v1/auth/verify-email/route";
import * as changePw from "@/app/api/v1/auth/change-password/route";
import * as sessions from "@/app/api/v1/auth/sessions/route";
import * as adminDash from "@/app/api/v1/admin/dashboard/route";

const TOKEN_MODE = { "x-auth-mode": "token" };

beforeAll(bootstrap);

describe("registration & login", () => {
  it("registers, auto-logs-in with an httpOnly cookie, never returns the password hash", async () => {
    const res = await call(register.POST, { method: "POST", body: { name: "Asha Rao", email: "Asha@Example.com", password: PASSWORD } });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ success: true, data: { user: { email: "asha@example.com", role: "customer", emailVerified: false, permissions: [] } } });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|scrypt\$/);
    expect(res.cookies.fourd_session).toBeTruthy();
    expect(res.headers.get("set-cookie")).toMatch(/HttpOnly/i);
    expect(res.headers.get("set-cookie")).toMatch(/SameSite=lax/i);
    expect(res.body.data.session.token).toBeUndefined(); // token only on opt-in
  });

  it("stores only a hash of the password and a hash of the session token", async () => {
    const u = await db.user.findUniqueOrThrow({ where: { email: "asha@example.com" } });
    expect(u.passwordHash.startsWith("scrypt$")).toBe(true);
    const s = await db.session.findFirstOrThrow({ where: { userId: u.id } });
    expect(s.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects duplicate emails, weak passwords and invalid input with field-level details", async () => {
    const dup = await call(register.POST, { method: "POST", body: { name: "Other", email: "asha@example.com", password: PASSWORD } });
    expect(dup.status).toBe(409);
    expect(dup.body.error!.code).toBe("EMAIL_TAKEN");
    const bad = await call(register.POST, { method: "POST", body: { name: "A", email: "nope", password: "short" } });
    expect(bad.status).toBe(422);
    expect(bad.body.error!.code).toBe("VALIDATION_ERROR");
    expect(bad.body.error!.details.fields.map((f: any) => f.path).filter((p: string, i: number, a: string[]) => a.indexOf(p) === i).sort()).toEqual(["email", "name", "password"]);
    expect(bad.body.requestId).toBeTruthy();
  });

  it("logs in with correct credentials and gives a generic error otherwise (no account enumeration)", async () => {
    const ok = await call(login.POST, { method: "POST", body: { email: "asha@example.com", password: PASSWORD }, headers: TOKEN_MODE });
    expect(ok.status).toBe(200);
    expect(ok.body.data.session.token).toBeTruthy();
    const wrongPw = await call(login.POST, { method: "POST", body: { email: "asha@example.com", password: "Wrong-pass-1" } });
    const noUser = await call(login.POST, { method: "POST", body: { email: "ghost@example.com", password: "Wrong-pass-1" } });
    expect(wrongPw.status).toBe(401);
    expect(noUser.status).toBe(401);
    expect(wrongPw.body.error!.message).toBe(noUser.body.error!.message);
  });

  it("locks the account after repeated failures", async () => {
    const u = await createUser({ email: "lock@example.com" });
    for (let i = 0; i < 5; i++) await call(login.POST, { method: "POST", body: { email: u.email, password: "Bad-password-1" } });
    const locked = await call(login.POST, { method: "POST", body: { email: u.email, password: PASSWORD } });
    expect(locked.status).toBe(423);
    expect(locked.body.error!.code).toBe("ACCOUNT_LOCKED");
  });

  it("blocks suspended accounts and invalidates their existing sessions", async () => {
    const u = await createUser({ email: "sus@example.com" });
    const l = await call(login.POST, { method: "POST", body: { email: u.email, password: PASSWORD }, headers: TOKEN_MODE });
    const token = l.body.data.session.token;
    await db.user.update({ where: { id: u.id }, data: { status: "SUSPENDED" } });
    expect((await call(me.GET, { token })).status).toBe(401);
    const again = await call(login.POST, { method: "POST", body: { email: u.email, password: PASSWORD } });
    expect(again.body.error!.code).toBe("ACCOUNT_DISABLED");
  });
});

describe("sessions", () => {
  it("authenticates with bearer or cookie, rejects anonymous and garbage tokens", async () => {
    const l = await call(login.POST, { method: "POST", body: { email: "asha@example.com", password: PASSWORD }, headers: TOKEN_MODE });
    const token = l.body.data.session.token;
    expect((await call(me.GET, { token })).body.data.user.email).toBe("asha@example.com");
    expect((await call(me.GET, { cookie: `fourd_session=${token}` })).status).toBe(200);
    expect((await call(me.GET)).status).toBe(401);
    expect((await call(me.GET, { token: "x".repeat(43) })).status).toBe(401);
  });

  it("logout revokes the server-side session", async () => {
    const l = await call(login.POST, { method: "POST", body: { email: "asha@example.com", password: PASSWORD }, headers: TOKEN_MODE });
    const token = l.body.data.session.token;
    const out = await call(logout.POST, { method: "POST", token });
    expect(out.status).toBe(204);
    expect((await call(me.GET, { token })).status).toBe(401);
  });

  it("refresh rotates the token: the old one stops working", async () => {
    const l = await call(login.POST, { method: "POST", body: { email: "asha@example.com", password: PASSWORD }, headers: TOKEN_MODE });
    const old = l.body.data.session.token;
    const r = await call(refresh.POST, { method: "POST", token: old, headers: TOKEN_MODE });
    expect(r.status).toBe(200);
    expect((await call(me.GET, { token: r.body.data.session.token })).status).toBe(200);
    expect((await call(me.GET, { token: old })).status).toBe(401);
  });

  it("lists sessions and flags the current one", async () => {
    const l = await call(login.POST, { method: "POST", body: { email: "asha@example.com", password: PASSWORD }, headers: TOKEN_MODE });
    const res = await call(sessions.GET, { token: l.body.data.session.token });
    expect(res.body.data.some((s: any) => s.current)).toBe(true);
  });
});

describe("CSRF protection", () => {
  it("rejects cookie-authenticated writes from a foreign origin", async () => {
    const l = await call(login.POST, { method: "POST", body: { email: "asha@example.com", password: PASSWORD }, headers: TOKEN_MODE });
    const res = await call(logout.POST, { method: "POST", cookie: `fourd_session=${l.body.data.session.token}`, origin: "https://evil.example" });
    expect(res.status).toBe(403);
    expect(res.body.error!.code).toBe("CSRF_REJECTED");
    expect((await call(me.GET, { token: l.body.data.session.token })).status).toBe(200); // session untouched
  });
  it("rejects cross-site fetches that omit Origin", async () => {
    const l = await call(login.POST, { method: "POST", body: { email: "asha@example.com", password: PASSWORD }, headers: TOKEN_MODE });
    const res = await call(logout.POST, { method: "POST", cookie: `fourd_session=${l.body.data.session.token}`, origin: false, headers: { "sec-fetch-site": "cross-site" } });
    expect(res.status).toBe(403);
  });
});

describe("email verification & password reset", () => {
  it("verifies email once with the emailed token", async () => {
    const mail = lastEmailTo("asha@example.com", "email.verification");
    const token = tokenFromMessage(mail!.text)!;
    expect(token).toBeTruthy();
    const ok = await call(verify.POST, { method: "POST", body: { token } });
    expect(ok.status).toBe(200);
    expect((await db.user.findUniqueOrThrow({ where: { email: "asha@example.com" } })).emailVerifiedAt).not.toBeNull();
    const replay = await call(verify.POST, { method: "POST", body: { token } });
    expect(replay.body.error!.code).toBe("INVALID_TOKEN");
  });

  it("never stores raw reset tokens in the notification outbox", async () => {
    await call(forgot.POST, { method: "POST", body: { email: "asha@example.com" } });
    const row = await db.notificationDelivery.findFirstOrThrow({ where: { template: "password.reset" }, orderBy: { createdAt: "desc" } });
    expect(JSON.stringify(row.payload)).not.toMatch(/[A-Za-z0-9_-]{40,}/);
  });

  it("forgot-password answers identically for unknown emails", async () => {
    const known = await call(forgot.POST, { method: "POST", body: { email: "asha@example.com" } });
    const unknown = await call(forgot.POST, { method: "POST", body: { email: "nobody@example.com" } });
    expect(known.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect(known.body.data).toEqual(unknown.body.data);
  });

  it("resets the password with a valid single-use token, killing all sessions", async () => {
    const l = await call(login.POST, { method: "POST", body: { email: "asha@example.com", password: PASSWORD }, headers: TOKEN_MODE });
    const oldToken = l.body.data.session.token;
    await call(forgot.POST, { method: "POST", body: { email: "asha@example.com" } });
    const token = tokenFromMessage(lastEmailTo("asha@example.com", "password.reset")!.text)!;
    expect((await call(reset.POST, { method: "POST", body: { token: "z".repeat(43), password: "New-Passw0rd" } })).body.error!.code).toBe("INVALID_TOKEN");
    expect((await call(reset.POST, { method: "POST", body: { token, password: "New-Passw0rd" } })).status).toBe(200);
    expect((await call(reset.POST, { method: "POST", body: { token, password: "Another-Passw0rd" } })).status).toBe(400); // single use
    expect((await call(me.GET, { token: oldToken })).status).toBe(401);
    expect((await call(login.POST, { method: "POST", body: { email: "asha@example.com", password: "New-Passw0rd" } })).status).toBe(200);
  });

  it("changes password only with the current one, keeping the calling session", async () => {
    const l = await call(login.POST, { method: "POST", body: { email: "asha@example.com", password: "New-Passw0rd" }, headers: TOKEN_MODE });
    const token = l.body.data.session.token;
    expect((await call(changePw.POST, { method: "POST", token, body: { currentPassword: "nope", newPassword: "Third-Passw0rd" } })).status).toBe(401);
    expect((await call(changePw.POST, { method: "POST", token, body: { currentPassword: "New-Passw0rd", newPassword: "Third-Passw0rd" } })).status).toBe(200);
    expect((await call(me.GET, { token })).status).toBe(200);
  });
});

describe("authorization", () => {
  it("keeps admin endpoints closed to anonymous users and customers", async () => {
    expect((await call(adminDash.GET)).status).toBe(401);
    const c = await createUser();
    const l = await call(login.POST, { method: "POST", body: { email: c.email, password: PASSWORD }, headers: TOKEN_MODE });
    const res = await call(adminDash.GET, { token: l.body.data.session.token });
    expect(res.status).toBe(403);
    expect(res.body.error!.code).toBe("FORBIDDEN");
  });

  it("does not let a client escalate its role through profile updates", async () => {
    const l = await call(login.POST, { method: "POST", body: { email: "asha@example.com", password: "Third-Passw0rd" }, headers: TOKEN_MODE });
    const res = await call(me.PATCH, { method: "PATCH", token: l.body.data.session.token, body: { name: "Asha R", role: "super_admin" } });
    expect(res.status).toBe(422); // unknown keys rejected (strict schema)
    const ok = await call(me.PATCH, { method: "PATCH", token: l.body.data.session.token, body: { name: "Asha Rao-Iyer" } });
    expect(ok.body.data.user.role).toBe("customer");
  });
});
