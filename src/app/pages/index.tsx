// pages/index.js
import { useQuery, gql } from "@apollo/client";
import client from "../lib/apolloClient";
import Link from "next/link";

const GET_HELLO = gql`
  query {
    hello
  }
`;

export default function Home() {
  const { loading, error, data } = useQuery(GET_HELLO);

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error: {error.message}</p>;

  return (
    <div style={{ textAlign: "center", marginTop: "50px" }}>
      <h1>{data.hello}</h1>
      <p>
        <Link href="/login">
          <a style={{ color: "#0070f3", textDecoration: "underline" }}>
            Go to Login Page
          </a>
        </Link>
      </p>
    </div>
  );
}