import React, { useState } from 'react';
import { QrCode, Camera, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const ScannerInterface = () => {
    const [scanning, setScanning] = useState(false);
    const [result, setResult] = useState(null);

    const startScan = () => {
        setScanning(true);
        setResult(null);

        // Simulate scan after 2 seconds
        setTimeout(() => {
            setScanning(false);
            setResult({
                status: 'valid', // or 'invalid'
                bookingId: 'BK-2024-105',
                user: 'Rahul S.',
                event: 'Mardaani 3',
                seats: 'Gold - A12, A13'
            });
        }, 2000);
    };

    return (
        <div className="flex flex-col items-center">
            <h1 className="text-3xl font-bold tracking-tight mb-8">Ticket Scanner</h1>

            <Card className="w-full max-w-lg shadow-lg">
                <CardContent className="p-10 flex flex-col items-center text-center">
                    {!scanning && !result && (
                        <>
                            <div className="w-48 h-48 bg-muted rounded-2xl flex items-center justify-center mb-8">
                                <QrCode size={80} className="text-muted-foreground" />
                            </div>
                            <Button
                                size="lg"
                                onClick={startScan}
                                className="w-full gap-2 text-lg font-bold"
                            >
                                <Camera size={20} />
                                Start Camera
                            </Button>
                        </>
                    )}

                    {scanning && (
                        <div className="w-full flex flex-col items-center py-8">
                            <div className="relative w-64 h-64 border-4 border-primary rounded-3xl overflow-hidden bg-black">
                                <div className="absolute top-0 left-0 right-0 h-1 bg-primary shadow-[0_0_20px_2px_rgba(226,55,68,0.8)] animate-[scan_1.5s_infinite_linear]" />
                                <img
                                    src="https://images.unsplash.com/photo-1518773553398-650c184e0bb3?auto=format&fit=crop&w=800&q=80"
                                    alt="camera feed"
                                    className="w-full h-full object-cover opacity-50"
                                />
                            </div>
                            <p className="mt-6 text-muted-foreground animate-pulse font-medium">Scanning QR Code...</p>
                            <style>{`
                                @keyframes scan {
                                    0% { top: 0; }
                                    100% { top: 100%; }
                                }
                            `}</style>
                        </div>
                    )}

                    {result && (
                        <div className="w-full animate-in fade-in zoom-in duration-300">
                            <div className="mb-6 flex justify-center">
                                {result.status === 'valid' ? (
                                    <CheckCircle size={80} className="text-green-500 fill-green-100" />
                                ) : (
                                    <XCircle size={80} className="text-red-500 fill-red-100" />
                                )}
                            </div>

                            <h2 className={`text-2xl font-black mb-2 ${result.status === 'valid' ? 'text-green-600' : 'text-red-600'}`}>
                                {result.status === 'valid' ? 'Verified Ticket' : 'Invalid Ticket'}
                            </h2>

                            {result.status === 'valid' && (
                                <div className="bg-muted/50 rounded-xl p-6 mt-6 text-left border">
                                    <div className="space-y-3">
                                        <div>
                                            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Booking ID</span>
                                            <div className="font-mono font-bold">{result.bookingId}</div>
                                        </div>
                                        <div>
                                            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Event</span>
                                            <div className="font-bold">{result.event}</div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">User</span>
                                                <div className="font-bold">{result.user}</div>
                                            </div>
                                            <div>
                                                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Seats</span>
                                                <div className="font-bold text-primary">{result.seats}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <Button
                                variant="outline"
                                onClick={startScan}
                                className="mt-8 gap-2"
                            >
                                <QrCode size={16} />
                                Scan Another
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default ScannerInterface;
