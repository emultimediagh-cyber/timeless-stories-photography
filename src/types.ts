export type Category = "Weddings" | "Portraits" | "Events" | "Family";

export interface Photo {
  id: string;
  url: string;
  alt: string;
  category: Category;
  /** width / height, used to reserve space before the image loads */
  ratio: number;
  featured?: boolean;
}

export interface Package {
  id: string;
  name: string;
  price: number;
  description: string;
  inclusions: string[];
  highlighted?: boolean;
}

export type BookingStatus = "pending" | "confirmed" | "completed" | "cancelled";

export interface Booking {
  id: string;
  name: string;
  phone: string;
  email: string;
  date: string;
  packageId: string;
  message: string;
  status: BookingStatus;
  createdAt: string;
}

export type BookingInput = Omit<Booking, "id" | "status" | "createdAt">;
