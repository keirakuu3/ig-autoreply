const express = require("express");
const app = express();
app.use(express.json());

const clean = (v) => (v || "").trim().replace(/^["']|["']$/g, "");

const VERIFY_TOKEN = clean(process.env.VERIFY_TOKEN);
const IG_TOKEN = clean(process.env.IG_TOKEN);
const IG_ID = clean(process.env.IG_ID);
const MESSAGES_ID = clean(process.env.MESSAGES_ID) || IG_ID;
const KEYWORD = clean(process.env.KEYWORD) || "LINK";
const FINAL_TEXT =
  (process.env.FINAL_TEXT || "").trim() ||
  "Thanks for following! 🎉 Here is your link:";
const FINAL_LINK = clean(process.env.FINAL_LINK);
const PORT = process.env.PORT || 3000;

// Picks the right address by the start of the token
const API = IG_TOKEN.startsWith("IGAA")
  ? "https://graph.instagram.com/v21.0"
  : "https://graph.facebook.com/v21.0";

const FIRST_TEXT =
  "Hey! 👋 To get the link, follow this account first, then tap the button below.";

console.log("CHECK IG_TOKEN length:", IG_TOKEN.length, "| starts with:", IG_TOKEN.slice(0, 4));
console.log("CHECK API:", API);
console.log("CHECK IG_ID:", IG_ID);
console.log("CHECK MESSAGES_ID:", MESSAGES_ID);
console.log("CHECK KEYWORD:", KEYWORD);
console.log("CHECK FINAL_LINK:", FINAL_LINK);

// Returns true if the message was sent
async function send(recipient, message) {
  const res = await fetch(`${API}/${MESSAGES_ID}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${IG_TOKEN}`,
    },
    body: JSON.stringify({ recipient, message }),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error("Send error:", JSON.stringify(data));
    return false;
  }
  console.log("Message sent OK");
  return true;
}

// Text + "Done ✅" button
function doneButtonMessage(text) {
  return {
    attachment: {
      type: "template",
      payload: {
        template_type: "button",
        text,
        buttons: [{ type: "postback", title: "Done ✅", payload: "CHECK_FOLLOW" }],
      },
    },
  };
}

// Text + "Open link" button
function linkButtonMessage() {
  return {
    attachment: {
      type: "template",
      payload: {
        template_type: "button",
        text: FINAL_TEXT,
        buttons: [{ type: "web_url", url: FINAL_LINK, title: "Open link" }],
      },
    },
  };
}

async function isFollowing(userId) {
  const res = await fetch(`${API}/${userId}?fields=is_user_follow_business`, {
    headers: { Authorization: `Bearer ${IG_TOKEN}` },
  });
  const data = await res.json();
  console.log("Follow check:", JSON.stringify(data));
  return data.is_user_follow_business === true;
}

async function checkAndReply(userId) {
  if (await isFollowing(userId)) {
    await send({ id: userId }, linkButtonMessage());
  } else {
    await send(
      { id: userId },
      doneButtonMessage("I don't see your follow yet 🙈 Follow the account, then tap the button again.")
    );
  }
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
      // 1) Comment with the keyword
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

        // Try with the Done button first
        const ok = await send({ comment_id: c.id }, doneButtonMessage(FIRST_TEXT));
        if (!ok) {
          console.log("Button not accepted, sending plain text instead");
          await send(
            { comment_id: c.id },
            {
              text:
                "Hey! 👋 To get the link, follow this account first, then reply to this message with any text (for example: DONE).",
            }
          );
        }
      }

      // 2) Person tapped a button or replied in the DM
      for (const m of entry.messaging || []) {
        if (m.message?.is_echo) continue;
        if (!m.message && !m.postback) continue;
        await checkAndReply(m.sender.id);
      }
    }
  } catch (err) {
    console.error(err);
  }
});

app.listen(PORT, () => console.log(`Listening on ${PORT}`));
