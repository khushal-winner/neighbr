export interface PollOption {
    id: string
    text: string
    votes: number
    percentage: number
}

export interface BlockPoll {
    id: string
    question: string
    communityId: string
    closesAt: string | null
    createdAt: string
    isClosed: boolean
    totalVotes: number
    options: PollOption[]
    myVoteOptionId: string | null
    hasVoted: boolean
    feedPostId?: string | null
}
