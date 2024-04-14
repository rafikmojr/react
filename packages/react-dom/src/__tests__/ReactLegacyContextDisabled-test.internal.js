/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 */

'use strict';

let React;
let ReactDOMClient;
let ReactDOMServer;
let ReactFeatureFlags;
let act;

describe('ReactLegacyContextDisabled', () => {
  beforeEach(() => {
    jest.resetModules();

    React = require('react');
    ReactDOMClient = require('react-dom/client');
    ReactDOMServer = require('react-dom/server');
    ReactFeatureFlags = require('shared/ReactFeatureFlags');
    ReactFeatureFlags.disableLegacyContext = true;
    act = require('internal-test-utils').act;
  });

  function formatValue(val) {
    if (val === null) {
      return 'null';
    }
    if (val === undefined) {
      return 'undefined';
    }
    if (typeof val === 'string') {
      return val;
    }
    return JSON.stringify(val);
  }

  it('warns for legacy context', async () => {
    class LegacyProvider extends React.Component {
      static childContextTypes = {
        foo() {},
      };
      getChildContext() {
        return {foo: 10};
      }
      render() {
        return this.props.children;
      }
    }

    const lifecycleContextLog = [];
    class LegacyClsConsumer extends React.Component {
      static contextTypes = {
        foo() {},
      };
      shouldComponentUpdate(nextProps, nextState, nextContext) {
        lifecycleContextLog.push(nextContext);
        return true;
      }
      UNSAFE_componentWillReceiveProps(nextProps, nextContext) {
        lifecycleContextLog.push(nextContext);
      }
      UNSAFE_componentWillUpdate(nextProps, nextState, nextContext) {
        lifecycleContextLog.push(nextContext);
      }
      render() {
        return formatValue(this.context);
      }
    }

    function LegacyFnConsumer(props, context) {
      return formatValue(context);
    }
    LegacyFnConsumer.contextTypes = {foo() {}};

    function RegularFn(props, context) {
      return formatValue(context);
    }

    const container = document.createElement('div');
    const root = ReactDOMClient.createRoot(container);
    await expect(async () => {
      await act(() => {
        root.render(
          <LegacyProvider>
            <span>
              <LegacyClsConsumer />
              <LegacyFnConsumer />
              <RegularFn />
            </span>
          </LegacyProvider>,
        );
      });
    }).toErrorDev([
      'LegacyProvider uses the legacy childContextTypes API which was removed in React 19. ' +
        'Use React.createContext() instead.',
      'LegacyClsConsumer uses the legacy contextTypes API which was removed in React 19. ' +
        'Use React.createContext() with static contextType instead.',
      'LegacyFnConsumer uses the legacy contextTypes API which was removed in React 19. ' +
        'Use React.createContext() with React.useContext() instead.',
    ]);
    expect(container.textContent).toBe('{}undefinedundefined');
    expect(lifecycleContextLog).toEqual([]);

    // Test update path.
    await act(() => {
      root.render(
        <LegacyProvider>
          <span>
            <LegacyClsConsumer />
            <LegacyFnConsumer />
            <RegularFn />
          </span>
        </LegacyProvider>,
      );
    });
    expect(container.textContent).toBe('{}undefinedundefined');
    expect(lifecycleContextLog).toEqual([{}, {}, {}]);
    root.unmount();

    // test server path.
    let text;
    expect(() => {
      text = ReactDOMServer.renderToString(
        <LegacyProvider>
          <span>
            <LegacyClsConsumer />
            <LegacyFnConsumer />
            <RegularFn />
          </span>
        </LegacyProvider>,
        container,
      );
    }).toErrorDev([
      'LegacyProvider uses the legacy childContextTypes API which was removed in React 19. ' +
        'Use React.createContext() instead.',
      'LegacyClsConsumer uses the legacy contextTypes API which was removed in React 19. ' +
        'Use React.createContext() with static contextType instead.',
      'LegacyFnConsumer uses the legacy contextTypes API which was removed in React 19. ' +
        'Use React.createContext() with React.useContext() instead.',
    ]);
    expect(text).toBe('<span>{}<!-- -->undefined<!-- -->undefined</span>');
    expect(lifecycleContextLog).toEqual([{}, {}, {}]);
  });

  it('renders a tree with modern context', async () => {
    const Ctx = React.createContext();

    class Provider extends React.Component {
      render() {
        return (
          <Ctx.Provider value={this.props.value}>
            {this.props.children}
          </Ctx.Provider>
        );
      }
    }

    class RenderPropConsumer extends React.Component {
      render() {
        return <Ctx.Consumer>{value => formatValue(value)}</Ctx.Consumer>;
      }
    }

    const lifecycleContextLog = [];
    class ContextTypeConsumer extends React.Component {
      static contextType = Ctx;
      shouldComponentUpdate(nextProps, nextState, nextContext) {
        lifecycleContextLog.push(nextContext);
        return true;
      }
      UNSAFE_componentWillReceiveProps(nextProps, nextContext) {
        lifecycleContextLog.push(nextContext);
      }
      UNSAFE_componentWillUpdate(nextProps, nextState, nextContext) {
        lifecycleContextLog.push(nextContext);
      }
      render() {
        return formatValue(this.context);
      }
    }

    function FnConsumer() {
      return formatValue(React.useContext(Ctx));
    }

    const container = document.createElement('div');
    const root = ReactDOMClient.createRoot(container);
    await act(() => {
      root.render(
        <Provider value="a">
          <span>
            <RenderPropConsumer />
            <ContextTypeConsumer />
            <FnConsumer />
          </span>
        </Provider>,
      );
    });
    expect(container.textContent).toBe('aaa');
    expect(lifecycleContextLog).toEqual([]);

    // Test update path
    await act(() => {
      root.render(
        <Provider value="a">
          <span>
            <RenderPropConsumer />
            <ContextTypeConsumer />
            <FnConsumer />
          </span>
        </Provider>,
      );
    });
    expect(container.textContent).toBe('aaa');
    expect(lifecycleContextLog).toEqual(['a', 'a', 'a']);
    lifecycleContextLog.length = 0;

    await act(() => {
      root.render(
        <Provider value="b">
          <span>
            <RenderPropConsumer />
            <ContextTypeConsumer />
            <FnConsumer />
          </span>
        </Provider>,
      );
    });
    expect(container.textContent).toBe('bbb');
    if (gate(flags => flags.enableLazyContextPropagation)) {
      // In the lazy propagation implementation, we don't check if context
      // changed until after shouldComponentUpdate is run.
      expect(lifecycleContextLog).toEqual(['b', 'b', 'b']);
    } else {
      // In the eager implementation, a dirty flag was set when the parent
      // changed, so we skipped sCU.
      expect(lifecycleContextLog).toEqual(['b', 'b']);
    }
    root.unmount();
  });
});
