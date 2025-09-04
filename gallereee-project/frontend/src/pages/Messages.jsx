// src/pages/Messages.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { useAuth } from "../contexts/AuthContext";
import { MsgAPI } from "../services/api";
import api from "../services/api";

/**
 * Quick helper to search users by username.
 * Add this backend route later if you want fuzzy search.
 * For now, we'll use a simple exact match endpoint below.
 */
async function findUserByUsername(username) {
  // You can replace this with a smarter search when you add it on the backend.
  // Example assumes a GET /api/auth/find?username=NAME endpoint (optional).
  try {
    const { data } = await api.get(`/auth/find`, { params: { username } });
    return data?.user || null;
  } catch {
    return null;
  }
}

export default function Messages() {
  const { user } = useAuth();

  const [convos, setConvos] = useState([]);
  const [active, setActive] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");

  // Start new chat form
  const [newUser, setNewUser] = useState("");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  // socket client
  const socket = useMemo(
    () =>
      io("http://localhost:5000", {
        autoConnect: false,
        auth: { token: localStorage.getItem("token") },
        transports: ["websocket"],
      }),
    []
  );

  // Keep scroll pinned to bottom on new messages
  const bottomRef = useRef(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  // Load conversations on mount
  useEffect(() => {
    MsgAPI.conversations().then(({ data }) => {
      setConvos(data || []);
      if (data && data[0]) setActive(data[0]);
    });
  }, []);

  // Load messages for active conversation
  useEffect(() => {
    if (!active?._id) return setMsgs([]);
    MsgAPI.getMessages(active._id).then(({ data }) => setMsgs(data || []));
  }, [active]);

  // Socket lifecycle
  useEffect(() => {
    socket.connect();

    const onNew = (m) => {
      // only append if message belongs to the currently open conversation
      if (m.conversation === active?._id) {
        setMsgs((prev) => [...prev, m]);
      }
      // bump lastMessageAt ordering by refreshing conversations
      MsgAPI.conversations().then(({ data }) => setConvos(data || []));
    };

    socket.on("connect", () => {
      // console.log("socket connected", socket.id);
    });
    socket.on("message:new", onNew);

    return () => {
      socket.off("message:new", onNew);
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, active?._id]);

  const send = (e) => {
    e.preventDefault();
    if (!text.trim() || !active?._id) return;

    const toUserId = active.participants.find((p) => p._id !== user._id)._id;

    // Optimistic UI (show immediately)
    const temp = {
      _id: "temp-" + Date.now(),
      conversation: active._id,
      sender: { _id: user._id },
      text,
      createdAt: new Date().toISOString(),
      __optimistic: true,
    };
    setMsgs((prev) => [...prev, temp]);

    socket.emit("message:send", {
      conversationId: active._id,
      toUserId,
      text,
    });
    setText("");
  };

  // Start a new conversation by username
  const startConversation = async (e) => {
    e.preventDefault();
    setError("");
    const username = newUser.trim();
    if (!username) return;

    try {
      setStarting(true);

      // Try to find the user by username (needs a tiny backend route)
      let target = await findUserByUsername(username);

      // If /auth/find is not implemented yet, you can quick-test by POSTing a known userId:
      // target = { _id: "<some-existing-user-id>", username };

      if (!target?._id) {
        setError("User not found.");
        setStarting(false);
        return;
      }

      const { data: convo } = await MsgAPI.start(target._id);

      // Refresh conversations and select the new/ existing one
      const { data } = await MsgAPI.conversations();
      setConvos(data || []);
      const found = (data || []).find((c) => c._id === convo._id) || convo;
      setActive(found);
      setNewUser("");
    } catch (err) {
      setError("Could not start conversation.");
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="messages">
      {/* Inbox */}
      <aside className="inbox">
        <h3 style={{ margin: "6px 4px 10px" }}>Messages</h3>

        {/* Start new chat */}
        <form className="form" onSubmit={startConversation} style={{ marginBottom: 10 }}>
          <input
            placeholder="Start chat by username…"
            value={newUser}
            onChange={(e) => setNewUser(e.target.value)}
          />
          <button className="btn" disabled={starting}>
            {starting ? "Starting…" : "Start"}
          </button>
          {error ? <small style={{ color: "#ff8080" }}>{error}</small> : null}
        </form>

        <ul>
          {convos.map((c) => {
            const other = c.participants.find((p) => p._id !== user._id);
            const activeCls = active?._id === c._id ? "active" : "";
            return (
              <li
                key={c._id}
                onClick={() => setActive(c)}
                className={activeCls}
                title={other?.username}
              >
                <span className="avatar">{(other?.username || "?")[0]?.toUpperCase()}</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                  {other?.username || "Unknown"}
                </span>
              </li>
            );
          })}
          {!convos.length && (
            <li style={{ opacity: 0.7, cursor: "default" }}>No conversations yet.</li>
          )}
        </ul>
      </aside>

      {/* Chat panel */}
      <section className="chat">
        {active ? (
          <>
            <div className="chat-head">
              {active.participants.find((p) => p._id !== user._id)?.username}
            </div>

            <div className="chat-body">
              {msgs.map((m) => {
                const mine = (m.sender?._id || m.sender) === user._id;
                return (
                  <div
                    key={m._id}
                    className={`bubble ${mine ? "me" : ""}`}
                    title={new Date(m.createdAt).toLocaleString()}
                  >
                    {m.text}
                    {m.__optimistic ? <span style={{ opacity: 0.5, marginLeft: 8 }}>…</span> : null}
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            <form className="chat-input" onSubmit={send}>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Write a message…"
              />
              <button className="btn primary">Send</button>
            </form>
          </>
        ) : (
          <div className="chat-empty">Select a conversation</div>
        )}
      </section>
    </div>
  );
}
