/// <reference types="astro/client" />

interface User {
  uid: string;
  email: string;
  plan: 'free' | 'premium';
  isAdmin: boolean;
}

declare namespace App {
  interface Locals {
    user: User | null;
  }
}
