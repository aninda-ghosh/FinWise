import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { needsSetup, register, login } from "../services/auth.service";

export const authRouter = new Hono();

const CredentialsSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(8),
});

authRouter.get("/status", async (c) => {
  return c.json({ needs_setup: await needsSetup() });
});

authRouter.post("/register", zValidator("json", CredentialsSchema), async (c) => {
  const { username, password } = c.req.valid("json");
  try {
    const token = await register(username, password);
    return c.json({ token });
  } catch (err: any) {
    return c.json({ error: err.message }, err.status ?? 500);
  }
});

authRouter.post("/login", zValidator("json", CredentialsSchema), async (c) => {
  const { username, password } = c.req.valid("json");
  try {
    const token = await login(username, password);
    return c.json({ token });
  } catch (err: any) {
    return c.json({ error: err.message }, err.status ?? 500);
  }
});
