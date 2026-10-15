// Custom server: Next.js + the ConversationRelay WebSocket endpoint + ngrok tunnel.
// One `npm run dev` runs everything.
import { createServer } from "node:http";
import next from "next";
import { WebSocketServer } from "ws";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv();

const port = parseInt(process.env.PORT || "3000", 10);
const dev = process.env.NODE_ENV !== "production";
let ngrokListener: import("@ngrok/ngrok").Listener | null = null;
let tunnelRestarting = false;

/**
 * Keep the owned Twilio number pointed at the rotating local tunnel.
 */
async function pointTwilioNumberAtTunnel(url: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const num = process.env.TWILIO_PHONE_NUMBER;
  if (!sid || !token || !num) return;
  try {
    const twilio = (await import("twilio")).default;
    const client = twilio(sid, token);
    const owned = await client.incomingPhoneNumbers.list({ phoneNumber: num, limit: 1 });
    if (owned[0]) {
      await client.incomingPhoneNumbers(owned[0].sid).update({ voiceUrl: `${url}/api/twilio/inbound`, voiceMethod: "POST" });
      console.log(`> Inbound calls to ${num} now reach ClaimLess (webhook updated).`);
    }
  } catch (e) {
    console.warn(`> Could not update Twilio inbound webhook: ${e instanceof Error ? e.message : e}`);
  }
}

async function openNgrokTunnel(setRuntime: (value: { publicUrl?: string }) => void) {
  if (tunnelRestarting) return;
  tunnelRestarting = true;
  try {
    if (ngrokListener) {
      try { await ngrokListener.close(); } catch {}
      ngrokListener = null;
    }
    const ngrok = await import("@ngrok/ngrok");
    const listener = await ngrok.forward({ addr: port, authtoken_from_env: true });
    const url = listener.url();
    if (!url) throw new Error("ngrok started without a public URL");
    ngrokListener = listener;
    setRuntime({ publicUrl: url });
    console.log(`> Public URL (ngrok): ${url}`);
    console.log("> Twilio can now reach this machine. Calls are ready.");
    await pointTwilioNumberAtTunnel(url);
  } catch (error) {
    setRuntime({});
    console.warn(`> ngrok tunnel failed: ${error instanceof Error ? error.message : error}`);
  } finally {
    tunnelRestarting = false;
  }
}

function monitorNgrokTunnel(setRuntime: (value: { publicUrl?: string }) => void) {
  setInterval(async () => {
    const url = ngrokListener?.url();
    if (!url || tunnelRestarting) return;
    try {
      const response = await fetch(url, {
        headers: { "ngrok-skip-browser-warning": "true" },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      console.warn(`> Public tunnel is unhealthy (${error instanceof Error ? error.message : error}); reconnecting…`);
      await openNgrokTunnel(setRuntime);
    }
  }, 20_000);
}

async function main() {
  const app = next({ dev });
  const handle = app.getRequestHandler();
  await app.prepare();

  // Imported lazily so dotenv is loaded first and the store module resolves cwd correctly.
  const { handleRelayConnection } = await import("./lib/voice/relay");
  const { setRuntime } = await import("./lib/store");

  const server = createServer((req, res) => handle(req, res));

  const wss = new WebSocketServer({ noServer: true });
  const nextUpgrade = app.getUpgradeHandler();
  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url || "/", "http://localhost");
    if (url.pathname === "/voice/ws") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        console.log("[voice] ConversationRelay connected", url.search);
        handleRelayConnection(ws, url.searchParams);
      });
    } else {
      // Let Next handle its own upgrades (dev HMR, etc.).
      void nextUpgrade(req, socket, head);
    }
  });

  server.listen(port, async () => {
    console.log(`> ClaimLess running at http://localhost:${port}`);

    if (process.env.PUBLIC_URL) {
      setRuntime({ publicUrl: process.env.PUBLIC_URL });
      console.log(`> Public URL (from PUBLIC_URL): ${process.env.PUBLIC_URL}`);
    } else if (process.env.NGROK_AUTHTOKEN) {
      await openNgrokTunnel(setRuntime);
      monitorNgrokTunnel(setRuntime);
    } else {
      setRuntime({});
      console.warn(`> No NGROK_AUTHTOKEN / PUBLIC_URL set — dashboard works, but Twilio calls will be unavailable.`);
    }
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
