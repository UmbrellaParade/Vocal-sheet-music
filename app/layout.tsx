import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "歌唱譜メーカー",
  description: "ボーカリストとボーカルトレーナーのための歌唱譜作成ツール"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
