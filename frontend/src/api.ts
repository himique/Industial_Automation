// frontend/src/api.ts
import { checkUserSession } from './auth';
const GQL_ENDPOINT = 'http://localhost:8000/graphql';

export async function fetchGraphQL(query: string, variables: object = {}, isProtected: boolean = false) {
    const headers = new Headers({ 'Content-Type': 'application/json' });
    if (isProtected) {
        const isAdmin = await checkUserSession();
        if (isAdmin){
            console.log(isAdmin)
        }
        else{
            alert("Auth Error: Token not found. Redirecting to login.");
            window.location.href = '/login.html';
            throw new Error("Token not found.");
        }
    }
    try {
        const response = await fetch(GQL_ENDPOINT, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ query, variables }),
            credentials: 'include',
        });

        if (!response.ok) throw new Error(`Network error: ${response.statusText}`);

        const result = await response.json();
        if (result.errors) throw new Error(result.errors.map((e: any) => e.message).join('\n'));

        return result.data;
    } catch (error) {
        console.error("GraphQL request failed:", error);
        throw error;
    }
}