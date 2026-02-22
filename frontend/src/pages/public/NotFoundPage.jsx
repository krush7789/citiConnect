import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

const NotFoundPage = () => {
  const navigate = useNavigate();
  return (
    <div className="container mx-auto px-4 md:px-8 py-16">
      <div className="max-w-xl mx-auto rounded-2xl border bg-white p-8 text-center">
        <h1 className="text-3xl font-black">404 · Page not found</h1>
        <p className="text-sm text-muted-foreground mt-3">The page you are trying to access does not exist.</p>
        <Button className="mt-6" onClick={() => navigate("/")}>
          Back to home
        </Button>
      </div>
    </div>
  );
};

export default NotFoundPage;
