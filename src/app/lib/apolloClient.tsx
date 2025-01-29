import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";

const client = new ApolloClient({
  link: new HttpLink({
    uri: "/api/graphql",
    fetch,
  }),
  cache: new InMemoryCache(),
});

export default client;
