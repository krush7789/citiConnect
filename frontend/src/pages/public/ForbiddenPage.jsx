import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

const ForbiddenPage = () => {
  const navigate = useNavigate();
  return (
    <div className="container mx-auto px-4 md:px-8 py-16">
      <div className="max-w-xl mx-auto rounded-2xl border bg-card p-8 text-center">
        <h1 className="text-3xl font-black">403 · Forbidden</h1>
        <p className="text-sm text-muted-foreground mt-3">You do not have access to this resource.</p>
        <Button className="mt-6" onClick={() => navigate("/")}>
          Go to home
        </Button>
      </div>
    </div>
  );
};

export default ForbiddenPage;
