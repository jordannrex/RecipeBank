import net from "node:net";
import tls from "node:tls";
import type { Socket } from "node:net";

type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

function buildMimeMessage(from: string, to: string, subject: string, text: string, html?: string): string {
  const date = new Date().toUTCString();

  if (!html) {
    return [
      `Date: ${date}`,
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/plain; charset=UTF-8`,
      ``,
      text,
    ].join("\r\n");
  }

  const boundary = `=_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return [
    `Date: ${date}`,
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset=UTF-8`,
    ``,
    text,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    ``,
    html,
    ``,
    `--${boundary}--`,
  ].join("\r\n");
}

type SmtpStage =
  | "greeting" | "ehlo" | "starttls" | "starttls-ehlo"
  | "auth" | "mail-from" | "rcpt-to" | "data-cmd" | "data-body" | "quit";

async function smtpSend(opts: {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
  to: string;
  message: string;
}): Promise<void> {
  const { host, port, secure, user, pass, from, to, message } = opts;

  return new Promise((resolve, reject) => {
    let socket: Socket = secure
      ? (tls.connect(port, host, { servername: host }) as unknown as Socket)
      : net.createConnection(port, host);

    let stage: SmtpStage = "greeting";
    let buf = "";
    let pendingLines: string[] = [];

    function write(cmd: string) {
      socket.write(`${cmd}\r\n`);
    }

    function fail(err: Error | string) {
      socket.destroy();
      reject(typeof err === "string" ? new Error(err) : err);
    }

    function advance(code: number, allLines: string[]) {
      if (code >= 400) {
        fail(`SMTP ${code}: ${allLines.at(-1)}`);
        return;
      }

      switch (stage) {
        case "greeting":
          stage = "ehlo";
          write("EHLO localhost");
          break;

        case "ehlo": {
          const caps = allLines.map((l) => l.slice(4).split(" ")[0].toUpperCase());
          if (!secure && caps.includes("STARTTLS")) {
            stage = "starttls";
            write("STARTTLS");
          } else if (user) {
            stage = "auth";
            // AUTH PLAIN: base64("\0user\0pass")
            write(`AUTH PLAIN ${Buffer.from(`\0${user}\0${pass ?? ""}`).toString("base64")}`);
          } else {
            stage = "mail-from";
            write(`MAIL FROM:<${from}>`);
          }
          break;
        }

        case "starttls": {
          // Upgrade the plain socket to TLS in-place
          const plain = socket;
          const upgraded = tls.connect({ socket: plain as net.Socket, servername: host }, () => {
            socket = upgraded as unknown as Socket;
            upgraded.on("data", onData);
            stage = "starttls-ehlo";
            write("EHLO localhost");
          });
          plain.removeAllListeners("data");
          upgraded.on("error", fail);
          break;
        }

        case "starttls-ehlo": {
          const caps = allLines.map((l) => l.slice(4).split(" ")[0].toUpperCase());
          if (user && caps.includes("AUTH")) {
            stage = "auth";
            write(`AUTH PLAIN ${Buffer.from(`\0${user}\0${pass ?? ""}`).toString("base64")}`);
          } else {
            stage = "mail-from";
            write(`MAIL FROM:<${from}>`);
          }
          break;
        }

        case "auth":
          stage = "mail-from";
          write(`MAIL FROM:<${from}>`);
          break;

        case "mail-from":
          stage = "rcpt-to";
          write(`RCPT TO:<${to}>`);
          break;

        case "rcpt-to":
          stage = "data-cmd";
          write("DATA");
          break;

        case "data-cmd":
          stage = "data-body";
          // Escape any leading dots (RFC 5321 §4.5.2)
          socket.write(`${message.replace(/^\./gm, "..")}\r\n.\r\n`);
          break;

        case "data-body":
          stage = "quit";
          write("QUIT");
          break;

        case "quit":
          socket.destroy();
          resolve();
          break;
      }
    }

    function onData(chunk: Buffer) {
      buf += chunk.toString();
      const parts = buf.split("\r\n");
      buf = parts.pop() ?? "";

      for (const line of parts) {
        if (!line) continue;
        const code = parseInt(line.slice(0, 3), 10);
        const isContinuation = line[3] === "-";
        pendingLines.push(line);

        if (!isContinuation) {
          const snapshot = pendingLines.slice();
          pendingLines = [];
          advance(code, snapshot);
        }
      }
    }

    socket.setTimeout(15_000);
    socket.on("timeout", () => fail(new Error("SMTP connection timed out")));
    socket.on("error", fail);
    socket.on("data", onData);
  });
}

export async function sendEmail({ to, subject, text, html }: SendEmailInput): Promise<void> {
  const from = process.env.EMAIL_FROM ?? "noreply@recipebank.app";

  if (!process.env.SMTP_HOST) {
    console.info("[email:dev-fallback]", { from, to, subject, text });
    return;
  }

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);

  await smtpSend({
    host,
    port,
    secure: port === 465,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from,
    to,
    message: buildMimeMessage(from, to, subject, text, html),
  });
}
