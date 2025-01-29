const CustomDice = ({ label }: { label: string }) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="100"
      height="100"
      className="text-white-500"
    >
      <rect x="2" y="2" width="15" height="15" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
      {/* Center text */}
      <text
        x="50%"
        y="50%"
        fontSize="5"
        textAnchor="middle"
        alignmentBaseline="central"
        fill="currentColor"
        fontWeight="bold"
      >
        {label}
      </text>
    </svg>
  );
  
  export default CustomDice;
  