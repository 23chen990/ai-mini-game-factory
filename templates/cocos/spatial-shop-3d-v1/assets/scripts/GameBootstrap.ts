import {
  _decorator,
  Camera,
  Color,
  Component,
  DirectionalLight,
  input,
  Input,
  KeyCode,
  Material,
  MeshRenderer,
  Node,
  primitives,
  sys,
  utils,
  Vec3,
  type EventKeyboard,
} from 'cc';
import { CarryStackSway } from './core/carry-sway';

const { ccclass } = _decorator;
const SAVE_KEY = 'spatial-shop-3d-save-v1';

type TestApi = {
  getState(): { x: number; z: number; carried: number };
  resetGame(): void;
  grantCurrency(amount: number): void;
};

@ccclass('GameBootstrap')
export class GameBootstrap extends Component {
  private readonly pressed = new Set<KeyCode>();
  private readonly carrySway = new CarryStackSway();
  private player?: Node;
  private currency = 0;
  private carried = 0;

  start() {
    this.buildCameraAndLight();
    this.buildGreybox();
    input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    input.on(Input.EventType.KEY_UP, this.onKeyUp, this);
    const saved = sys.localStorage.getItem(SAVE_KEY); // localStorage persistence marker for Builder verification.
    if (saved) this.currency = Number(JSON.parse(saved).currency ?? 0);
    (globalThis as typeof globalThis & { __GAME_TEST__?: TestApi }).__GAME_TEST__ = {
      getState: () => ({ x: this.player?.position.x ?? 0, z: this.player?.position.z ?? 0, carried: this.carried }),
      resetGame: () => { this.player?.setPosition(0, 0.75, 6); this.carried = 0; },
      grantCurrency: (amount) => { this.currency += amount; this.save(); },
    };
  }

  update(deltaTime: number) {
    if (!this.player) return;
    const direction = new Vec3(
      Number(this.pressed.has(KeyCode.KEY_D)) - Number(this.pressed.has(KeyCode.KEY_A)),
      0,
      Number(this.pressed.has(KeyCode.KEY_S)) - Number(this.pressed.has(KeyCode.KEY_W)),
    );
    if (direction.lengthSqr() > 0) {
      direction.normalize();
      this.player.setPosition(
        this.player.position.x + direction.x * deltaTime * 5,
        this.player.position.y,
        this.player.position.z + direction.z * deltaTime * 5,
      );
    }
    this.carrySway.step({ deltaSeconds: deltaTime, lateralAcceleration: direction.x * 8, turnRate: direction.z * 2, stackSize: this.carried });
  }

  onDestroy() {
    input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
    input.off(Input.EventType.KEY_UP, this.onKeyUp, this);
  }

  private buildCameraAndLight() {
    const cameraNode = new Node('Main Camera');
    cameraNode.setPosition(12, 16, 18);
    cameraNode.setRotationFromEuler(-34, 34, 0);
    const camera = cameraNode.addComponent(Camera);
    camera.projection = Camera.ProjectionType.ORTHO;
    camera.orthoHeight = 12;
    camera.clearColor = new Color(236, 243, 235, 255);
    this.node.scene?.addChild(cameraNode);

    const lightNode = new Node('Main Light');
    lightNode.setRotationFromEuler(-48, -32, 0);
    lightNode.addComponent(DirectionalLight).illuminance = 55_000;
    this.node.scene?.addChild(lightNode);
  }

  private buildGreybox() {
    this.createBox('Floor', new Vec3(0, -0.25, 0), new Vec3(18, 0.5, 24), new Color(255, 243, 214));
    this.createBox('Car Assembler', new Vec3(-5, 1, -6), new Vec3(4, 2, 3), new Color(239, 106, 98));
    this.createBox('Car Shelf', new Vec3(-4, 1, 0), new Vec3(3, 2, 1), new Color(31, 167, 162));
    this.createBox('Checkout', new Vec3(0, 0.8, 6), new Vec3(4, 1.6, 1.5), new Color(245, 185, 71));
    this.createBox('Brick Expansion', new Vec3(6, 0.1, 5), new Vec3(3, 0.2, 3), new Color(104, 163, 224));
    this.player = this.createBox('Player', new Vec3(0, 0.75, 4), new Vec3(1.1, 1.5, 1.1), new Color(67, 86, 112));
  }

  private createBox(name: string, position: Vec3, scale: Vec3, color: Color) {
    const node = new Node(name);
    node.setPosition(position);
    node.setScale(scale);
    const renderer = node.addComponent(MeshRenderer);
    renderer.mesh = utils.createMesh(primitives.box());
    const material = new Material();
    material.initialize({ effectName: 'builtin-standard' });
    material.setProperty('mainColor', color);
    renderer.setMaterial(material, 0);
    this.node.addChild(node);
    return node;
  }

  private onKeyDown(event: EventKeyboard) { this.pressed.add(event.keyCode); }
  private onKeyUp(event: EventKeyboard) { this.pressed.delete(event.keyCode); }
  private save() { sys.localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 1, currency: this.currency })); }
}
