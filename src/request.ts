export class OpenRequest {
    pokemon_id: number = 0
    iv: number = 0
    lat: number = 0
    lng: number = 0
    enc_id: string = ''
    spawn_id: string = ''
    added_at: number = Math.floor(new Date().getTime() / 1000)
    callback: string = ''
    data_enpdoint: string = ''
    type: string = 'rdm'
}