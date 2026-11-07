const express = require("express");
const app = express();
app.use(express.json());

const {
  VERIFY_TOKEN,
  IG_TOKEN,
  IG_ID,
  KEYWORD = "Project",
  FINAL_TEXT = "Thank you for follow. Here's the link",
  FINAL_LINK,
  PORT = 3000,
} = process.env;

const API = "https://graph.instagram.com/v21.0";

async function send(recipient, message) {
  const res = await fetch(`${API}/${IG_ID}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${IG_TOKEN}`,
    },
    body: JSON.stringify({ recipient, message }),
  });
  const data = await res.json();
  if (!res.ok) console.error("Send error:", JSON.stringify(data));
  else console.log("Message sent OK");
  return data;
}

async function sendLinkButton(userId) {
  return send(
    { id: userId },
    {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: FINAL_TEXT,
          buttons: [{ type: "web_url", url: FINAL_LINK, title: "Open link" }],
        },
      },
    }
  );
}

async function isFollowing(userId) {
  const res = await fetch(
    `${API}/${userId}?fields=is_user_follow_business&access_token=${IG_TOKEN}`
  );
  const data = await res.json();
  console.log("Follow check:", JSON.stringify(data));
  return data.is_user_follow_business === true;
}

app.get("/webhook", (req, res) => {
  if (
    req.query["hub.mode"] === "subscribe" &&
    req.query["hub.verify_token"] === VERIFY_TOKEN
  ) {
    return res.status(200).send(req.query["hub.challenge"]);
  }
  res.sendStatus(403);
});

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  console.log("WEBHOOK RECEIVED:", JSON.stringify(req.body));

  try {
    for (const entry of req.body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== "comments") continue;
        const c = change.value;
        console.log("Comment text:", c.text, "| keyword:", KEYWORD);
        if (c.from?.id === IG_ID) {
          console.log("Skipped: comment is from your own account");
          continue;
        }
        if (!c.text || !c.text.toUpperCase().includes(KEYWORD.toUpperCase())) {
          console.log("Skipped: keyword not found in comment");
          continue;
        }

        await send(
          { comment_id: c.id },
          {
            text:
              "Hey! 👋 To get the link, follow this account first, then reply to this message with any text (for example: DONE).",
          }
        );
      }

      for (const m of entry.messaging || []) {
        if (!m.message || m.message.is_echo) continue;
        const userId = m.sender.id;

        if (await isFollowing(userId)) {
          await sendLinkButton(userId);
        } else {
          await send(
            { id: userId },
            {
              text: "I don't see your follow yet 🙈 Follow the account, then tap the button.",
              quick_replies: [
                { content_type: "text", title: "I followed ✅", payload: "CHECK_FOLLOW" },
              ],
            }
          );
        }
      }
    }
  } catch (err) {
    console.error(err);
  }
});

app.listen(PORT, () => console.log(`Listening on ${PORT}`));
