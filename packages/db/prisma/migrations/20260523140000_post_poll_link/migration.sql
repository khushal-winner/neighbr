-- Link block polls to feed posts
ALTER TABLE "Post" ADD COLUMN "pollId" TEXT;

CREATE UNIQUE INDEX "Post_pollId_key" ON "Post"("pollId");

ALTER TABLE "Post" ADD CONSTRAINT "Post_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE SET NULL ON UPDATE CASCADE;
