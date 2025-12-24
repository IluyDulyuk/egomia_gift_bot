import { axiosClassic, axiosWithAuth } from "../api/api.config";
import { IAdmin, IChannel, IGift, IMember } from "../types/api.types";

// Admin
export const createAdmin = async (id: string, data: IAdmin) => {
    await axiosWithAuth(id).post("/admin", data);
};

// Channel
export const findAllChannels = async (id: string) => {
    const { data: response } = await axiosWithAuth(id).get("/channel");

    return response as IChannel[];
};

export const addChannel = async (id: string, data: IChannel) => {
    await axiosWithAuth(id).post("/channel", data);
};

export const deleteChannel = async (id: string, data: IChannel) => {
    await axiosWithAuth(id).delete(`/channel/${data.id}`);
};

// Gift

export const findAllGifts = async (id: string) => {
    const { data: response } = await axiosWithAuth(id).get("/gift");

    return response as IGift[];
};

export const findeOneGift = async (giftId: string) => {
    const { data: response } = await axiosClassic.get(`/gift/${giftId}`);

    return response as IGift;
};

export const createGift = async (id: string, data: IGift) => {
    await axiosWithAuth(id).post("/gift", data);
};

export const updateGift = async (id: string, data: IGift) => {
    await axiosClassic.patch(`/gift/${id}`, data);
};

export const getStartPooling = async () => {
    const { data: response } = await axiosClassic.get(`/gift/pooling/start`);

    return response as IGift[];
};

export const getEndPooling = async () => {
    const { data: response } = await axiosClassic.get(`/gift/pooling/end`);

    return response as IGift[];
};

export const addMember = async (id: string, data: IMember) => {
    await axiosWithAuth(id).post("/member", data);
};
