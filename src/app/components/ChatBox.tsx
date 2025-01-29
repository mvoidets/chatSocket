"use client";

import { useState, useEffect } from "react";
import { socket } from "../lib/socketClient"; // assuming this is your socket connection setup
import ChatForm from "../components/ChatForm";
import ChatMessage from "../components/ChatMessage";
import "../globals.css";

export default function ChatBox() {
  const [room, setRoom] = useState("");
  const [joined, setJoined] = useState(false);
  const [messages, setMessages] = useState<{ sender: string; message: string }[]>([]);
  const [userName, setUserName] = useState("");

  useEffect(() => {
       // Retrieve the username from localStorage
       const storedUserName = localStorage.getItem("userName");
       if (storedUserName) {
         setUserName(storedUserName);
       }

    socket.on("message", (data) => {
      setMessages((prev) => [...prev, data]);
    });

    socket.on("user_joined", (message: string) => {
      setMessages((prev) => [...prev, { sender: "system", message }]);
    });

    return () => {
      socket.off("user_joined");
      socket.off("message");
    };
  }, []);

  const handleJoinRoom = () => {
    if (room && userName) {
      socket.emit("join-room", { room, username: userName });
      setJoined(true);
    }
  };

  const handleSendMessage = (message: string) => {
    const data = { room, message, sender: userName };
    setMessages((prev) => [...prev, { sender: userName, message }]);
    socket.emit("message", data);
  };

  return (
    <div className="fixed bottom-4 left-4 w-50 max-w-3xl mx-auto p-4 bg-white border rounded-lg shadow-lg">
    {!joined ? (
      <div className="flex flex-col items-center">
        <h1 className="text-2xl  font-bold text-gray-900">Chat Room</h1>
        <div className="w-64 px-4 py-2 mb-4 border-2 text-black placeholder-gray-800 rounded-l bold text-lg bg-gray-200">
           Player: {userName}
          </div>
          {/* <div className="w-64 px-4 py-2 mb-4 border-2 text-black placeholder-gray-800 rounded-l bold text-lg bg-gray-200">
           Flex-Dice Chat 
          </div> */}
        <input
          type="text"
          placeholder="Enter room name"
          value={room}
          onChange={(e) => setRoom(e.target.value)}
          className="w-64 px-4 py-2 mb-4 border-2 text-black placeholder-gray-800 rounded-lg"
        />
        <button
          className="p-2 mt-4 text-white bg-blue-500 rounded-lg"
          onClick={handleJoinRoom}
        >
          Join Chat
        </button>
      </div>
    ) : (
      <div className="w-full max-w-3xl mx-auto">
        <h1 className="mb-4 text-2xl font-bold text-gray-900">Room: {room}</h1>
        <div className="h-[200px] overflow-y-auto p-4 mb-4 bg-gray-200 border-2 text-black rounded-lg">
          <div>
            {messages.map((msg, index) => (
              <ChatMessage
                key={index}
                sender={msg.sender}
                message={msg.message}
                isOwnMessage={msg.sender === userName}
              />
            ))}
          </div>
          <ChatForm onSendMessage={handleSendMessage} />
        </div>
      </div>
    )}
  </div>
  
  );
}
