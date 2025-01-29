"use client";

import { useState, useEffect } from "react";
import Nav from "./components/Nav";
import ChatBox from "./components/ChatBox";
import MainDropdown from "./components/MainDropdown";
import DiceCluster from "./components/DiceCluster"; 
import AvatarCarousel from "./components/AvatarCarousel"; 
import { ReactNode } from "react";
import { usePathname } from "next/navigation"; 
import Stats from "./components/Stats";
import "./globals.css";

type LayoutProps = {
  children: ReactNode;
};

const Layout = ({ children }: LayoutProps) => {
  const [isLoggedIn, setIsLoggedIn] = useState(false); // Track login state
  const [avatarSelected, setAvatarSelected] = useState(false); // Track avatar selection
  const pathname = usePathname(); // Get current path

  // Simulate login for testing (you can replace this with your actual authentication logic)
  useEffect(() => {
    // Check if the user is logged in (use session data, cookies, or localStorage in a real app)
    const loggedInUser = false; // Simulate a logged-in state (change to true to test)
    setIsLoggedIn(loggedInUser);
  }, []);

  const isMainPage = pathname === "/"; // Check if it's the main page
  const isLoginPage = pathname === "/login"; // Check if it's the login page
  const isSignupPage = pathname === "/signup"; // Check if it's the signup page

  // Handle avatar selection (this could be done by setting the avatar after signup)
  const handleAvatarSelection = (avatar: string) => {
    console.log("Avatar selected:", avatar);
    setAvatarSelected(true);
    setIsLoggedIn(true); // Simulate manual login after avatar selection
  };

  return (
    <html lang="en">
      <body>
        <div className="relative min-h-screen bg-cover bg-center">
          {/* Show DiceCluster only on the main page '/' if not logged in */}
          {isMainPage && !isLoggedIn && (
            <div className="absolute inset-0 flex justify-center items-center">
              <DiceCluster />
            </div>
          )}

          {/* Show AvatarCarousel only on the login page '/login' */}
          {isLoginPage && !isLoggedIn && (
            <div className="absolute inset-0 flex justify-center items-center">
              <AvatarCarousel onSelectAvatar={handleAvatarSelection} />
            </div>
          )}

          {/* On the signup page '/signup', show AvatarCarousel until the avatar is selected */}
          {isSignupPage && !avatarSelected && (
            <div className="absolute inset-0 flex justify-center items-center">
              <AvatarCarousel onSelectAvatar={handleAvatarSelection} />
            </div>
          )}

          <main
            style={{
              padding: "20px",
              position: "relative", // Ensures content sits above background image
              zIndex: 1,
              background:
                "url(/images/fade_lrc.jpg) center center / cover no-repeat", // Set the background image
              height: "100%",
              flex: 1,
            }}
          >
            <Nav />
            <MainDropdown />
            {children}
           
          </main>
          <ChatBox />
          <Stats />
          
        </div>
      </body>
    </html>
  );
};

export default Layout;
