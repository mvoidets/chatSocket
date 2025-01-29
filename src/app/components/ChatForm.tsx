"use client";

import React, { useState } from 'react'

const ChatForm = ({onSendMessage}: {
    onSendMessage: ( message: string) => void}) => {
    const [message, setMessage] = useState("");

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if(message.trim() !== "") {
            onSendMessage(message);
            setMessage("");
            console.log("Message sent");
        }
    };

  return (
    <form onSubmit= {handleSubmit} className="flex gap-2 mt-4">
      <input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        className="flex-1 px-4 border-2 py-2 rounded-lg placeholder-gray-600 focus:outline-none"
        placeholder="Type your message..."
      />
      <button type="submit" className="p-2 bg-blue-500 text-black rounded">Send</button>
    </form>
  )
}

export default ChatForm
