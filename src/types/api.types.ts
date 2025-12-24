export interface IAdmin {
    id?: string;
    username?: string;
}

export interface IChannel {
    id?: string;
    channelname?: string;
}

export interface IGift {
    id?: string;

    startPostMedia?: string | null;
    startPostContent?: string;
    startPostContentEntities?: JSON;
    startPostDate?: Date | string;
    startPostStatus?: "AWAITING" | "PUBLISH";
    startPostMediaType?: string | null;
    startMessageId?: string;

    endPostMedia?: string | null;
    endPostContent?: string;
    endPostContentEntities?: JSON;
    endPostDate?: Date | string;
    endPostStatus?: "AWAITING" | "PUBLISH";
    endPostMediaType?: string | null;

    status?: "ACTIVE" | "COMPLETED";

    channels?: string[];

    members?: IMember[];

    adminId?: string;
}

export interface IMember {
    telegramId?: string;
    username?: string;
    picture?: string | null;
    giftId?: string;
}
