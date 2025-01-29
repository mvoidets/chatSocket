import AvatarDropdown from "../../components/MainDropdown";

const Page = () => {
  return (
    <div className="relative min-h-screen bg-cover bg-center flex items-center justify-center">
      <div className="max-w-sm p-6 bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
        <a href="#">
          <h5 className="mb-2 text-2xl font-semibold tracking-tight text-gray-900 dark:text-white">
            How to play:
          </h5>
        </a>
        <p>Each player receives 3 chips.</p>
        <ul className="list-disc pl-6 font-bold">
          <li>
            Choose a player to start. This player takes their turn by rolling
            the dice.
          </li>
          <li>If you have 3 or more chips, roll all 3 dice.</li>
          <li>If you have 2 chips, roll 2 dice.</li>
          <li>If you have 1 chip, roll 1 die.</li>
          <li>If you have no chips, don’t roll any dice.</li>
        </ul>
        <p>
          After rolling the dice, the player takes action depending on the dice
          rolled.
        </p>
        <ul className="list-disc pl-6 font-bold">
          <li>Rolling an L: Pass a chip to the player on your left.</li>
          <li>Rolling an R: Pass a chip to the player on your right.</li>
          <li>Rolling a C: Put a chip in the center pot.</li>
          <li>Rolling a D: Do nothing.</li>
        </ul>
        <p>
          If you lose all your chips, you aren't out of the game but you don’t
          roll any dice until another player passes you a chip.
        </p>
        <br />

        <p>
          <strong>Winning the Game:</strong>
        </p>
        <br />

        <p>
          The game ends when only one player has chips left. That player is the
          winner. And they get to take all the chips from the center pot!
        </p>

        <a
          href="https://www.youtube.com/watch?v=OxxpTWk3Rx0&t=21s"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex font-medium items-center text-blue-600 hover:underline mt-4"
        >
          Watch the video
          <svg
            className="w-3 h-3 ms-2.5 rtl:rotate-[270deg]"
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 18 18"
          >
            <path
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M15 11v4.833A1.166 1.166 0 0 1 13.833 17H2.167A1.167 1.167 0 0 1 1 15.833V4.167A1.166 1.166 0 0 1 2.167 3h4.618m4.447-2H17v5.768M9.111 8.889l7.778-7.778"
            />
          </svg>
        </a>
      </div>
    </div>
  );
};

export default Page;
