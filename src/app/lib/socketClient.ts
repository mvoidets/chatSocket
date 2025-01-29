"use client";
import { io } from "socket.io-client";

const socket = io("http://localhost:3000");  // Ensure this points to your server URL
export { socket };

